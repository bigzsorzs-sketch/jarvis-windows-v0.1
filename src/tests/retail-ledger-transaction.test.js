import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { moduleHarness } from './helpers/runtime-module.js';
const require = createRequire(import.meta.url);
const { LocalDatabase } = require('../../electron/data/local-database.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-retail-'));
  const db = new LocalDatabase(path.join(dir, 'db.sqlite'));
  t.after(() => { db.close(); fs.rmSync(dir, { recursive:true, force:true }); });
  const business = db.create('Business', { name:'Shop', revenue_monthly:99999, expense_monthly:999 });
  const product = db.create('RetailProduct', { name:'Product', price:10, cost:6, stock:10, business_id:business.id });
  const request = { product_id:product.id, quantity:2, discount:20, date:'2026-10-08', operation_id:'retail-operation-0001' };
  return { db, business, product, request };
}

test('paid sale atomically updates stock and ledger with undiscounted cost of goods', t => {
  const { db, request, business } = fixture(t);
  const r = db.recordRetailSale(request);
  assert.equal(r.product.stock, 8);
  assert.equal(r.sale.revenue, 16);
  assert.equal(r.sale.cost_of_goods, 12);
  assert.equal(r.sale.profit, 4);
  assert.equal(r.entry.amount, 16);
  assert.equal(r.entry.business_id, business.id);
  assert.equal(r.entry.source_sale_id, r.sale.id);
});

test('repeated sale returns the same receipt after restart and snapshot restoration', t => {
  const { db, request } = fixture(t);
  const original = db.recordRetailSale(request);
  db.close(); db.open();
  assert.equal(db.recordRetailSale(request).sale.id, original.sale.id);
  const snapshot = db.exportSnapshot();
  db.importSnapshot(snapshot);
  assert.equal(db.recordRetailSale(request).sale.id, original.sale.id);
  assert.equal(db.filter('RetailSale').length, 1);
  assert.equal(db.filter('FinanceEntry').length, 1);
  assert.equal(db.filter('RetailProduct')[0].stock, 8);
  assert.throws(() => db.recordRetailSale({ ...request, quantity:1 }), /OPERATION_ID_CONFLICT/);
});

test('ledger failure rolls back the sale, stock and operation receipt', t => {
  const { db, request } = fixture(t);
  const create = db._create.bind(db);
  db._create = (entity, data) => { if (entity === 'FinanceEntry') throw new Error('DISK_FAILURE'); return create(entity, data); };
  assert.throws(() => db.recordRetailSale(request), /DISK_FAILURE/);
  assert.equal(db.filter('RetailSale').length, 0);
  assert.equal(db.filter('RetailOperation').length, 0);
  assert.equal(db.filter('RetailProduct')[0].stock, 10);
  db._create = create;
  assert.equal(db.recordRetailSale(request).success, true);
});

test('invalid quantity, discount, calendar date and overselling never change data', t => {
  const { db, request } = fixture(t);
  for (const patch of [{ quantity:0 }, { quantity:-1 }, { quantity:1.5 }, { quantity:11 }, { discount:101 }, { discount:-1 }, { date:'2026-02-30' }]) {
    assert.throws(() => db.recordRetailSale({ ...request, ...patch }));
    assert.equal(db.filter('RetailProduct')[0].stock, 10);
    assert.equal(db.filter('FinanceEntry').length, 0);
  }
});

test('separate concurrent connections observe current stock and refuse overselling', t => {
  const { db, request } = fixture(t);
  const second = new LocalDatabase(db.dbPath);
  try {
  db.recordRetailSale({ ...request, quantity:8 });
  assert.throws(() => second.recordRetailSale({ ...request, quantity:3, operation_id:'retail-operation-0002' }), /INSUFFICIENT_STOCK/);
  assert.equal(second.filter('RetailProduct')[0].stock, 2);
  } finally { second.close(); }
});

test('return restores stock and records a compensating refund exactly once', t => {
  const { db, request } = fixture(t);
  const sale = db.recordRetailSale(request).sale;
  const reversal = { sale_id:sale.id, date:'2026-10-09', operation_id:'retail-return-0001' };
  const r = db.voidRetailSale(reversal);
  assert.equal(r.product.stock, 10);
  assert.equal(r.sale.status, 'voided');
  assert.equal(r.entry.type, 'expense');
  assert.equal(r.entry.amount, 16);
  assert.equal(db.voidRetailSale(reversal).entry.id, r.entry.id);
  assert.throws(() => db.voidRetailSale({ ...reversal, operation_id:'retail-return-0002' }), /ALREADY_VOIDED/);
  assert.equal(db.filter('FinanceEntry').length, 2);
  assert.throws(() => db.delete('FinanceEntry', r.entry.id), /LEDGER_MANAGED/);
  assert.throws(() => db.update('RetailSale', sale.id, { revenue:0 }), /SALE_MANAGED/);
});

test('stock movement uses latest stock and stale stocktakes cannot overwrite a sale', t => {
  const { db, request, product } = fixture(t);
  db.recordRetailSale(request);
  assert.throws(() => db.adjustRetailStock({ product_id:product.id, stock:99, expected_stock:10, operation_id:'stocktaking-operation-0001' }), /STOCK_CHANGED/);
  const movement = { product_id:product.id, quantity:3, direction:'in', operation_id:'stocktaking-operation-0002' };
  assert.equal(db.adjustRetailStock(movement).product.stock, 11);
  assert.equal(db.adjustRetailStock(movement).product.stock, 11);
  const audit = db.filter('RetailStockMovement')[0];
  assert.throws(() => db.delete('RetailStockMovement', audit.id), /STOCK_MOVEMENT_MANAGED/);
  assert.throws(() => db.create('RetailStockMovement', { stock:100 }), /USE_MANAGED_OPERATION/);
});

test('ledger summaries use actual current-month company entries, excluding projections and personal money', t => {
  const { db, request, business } = fixture(t);
  db.recordRetailSale(request);
  db.create('FinanceEntry', { amount:5, type:'expense', category:'ceges', business_id:business.id, date:'2026-10-08' });
  db.create('FinanceEntry', { amount:1000, type:'income', category:'magan', date:'2026-10-08' });
  db.create('FinanceEntry', { amount:1000, type:'income', category:'ceges', business_id:business.id, date:'2026-09-30' });
  const h = moduleHarness();
  const ledger = h.load('src/lib/financialLedger.js');
  const finance = db.filter('FinanceEntry');
  const rows = ledger.businessesWithLedger([business], finance, '2026-10');
  assert.equal(rows[0].revenue_monthly, 16);
  assert.equal(rows[0].expense_monthly, 5);
  assert.equal(rows[0].reported_revenue_monthly, 99999);
  assert.equal(ledger.ledgerSummary(finance, '2026-10').income, 16);
});

test('invoice creation derives rounded totals and payment enters the ledger once', t => {
  const { db, business } = fixture(t);
  const invoice = db.create('Invoice', { invoice_number:'TEST-001', items:[{ quantity:3, unit_price:0.1, total:99999 }], total_amount:99999,
    status:'kiallitva', business_id:business.id });
  assert.equal(invoice.total_amount, 0.3);
  assert.equal(db.filter('FinanceEntry').length, 0);
  const request = { invoice_id:invoice.id, date:'2026-10-08', operation_id:'invoice-payment-operation-0001' };
  const result = db.recordInvoicePayment(request);
  assert.equal(result.entry.amount, 0.3);
  assert.equal(result.invoice.status, 'kifizetve');
  assert.equal(db.recordInvoicePayment({ ...request, operation_id:'invoice-payment-operation-0002' }).entry.id, result.entry.id);
  assert.equal(db.filter('FinanceEntry').length, 1);
  assert.throws(() => db.delete('FinanceEntry', result.entry.id), /LEDGER_MANAGED/);
  assert.throws(() => db.delete('Invoice', invoice.id), /PAID_INVOICE_LOCKED/);
  assert.throws(() => db.update('Invoice', invoice.id, { status:'piszkozat' }), /PAID_INVOICE_LOCKED/);
});

test('invoice ledger failure rolls back the paid state and leaves the invoice collectible', t => {
  const { db } = fixture(t);
  const invoice = db.create('Invoice', { invoice_number:'TEST-002', items:[{ quantity:1, unit_price:20 }], status:'kiallitva' });
  const update = db._update.bind(db);
  db._update = (entity, ...args) => { if (entity === 'Invoice') throw new Error('DISK_FULL'); return update(entity,...args); };
  assert.throws(() => db.recordInvoicePayment({ invoice_id:invoice.id, operation_id:'invoice-payment-operation-0003', date:'2026-10-08' }), /DISK_FULL/);
  assert.equal(db.filter('Invoice')[0].status, 'kiallitva');
  assert.equal(db.filter('FinanceEntry').length, 0);
});

test('manual finance operation survives replay without duplicate money', t => {
  const { db } = fixture(t);
  const request = { description:'Fixture income', amount:12.25, date:'2026-10-08', type:'income', category:'magan', operation_id:'finance-manual-operation-0001' };
  const first = db.create('FinanceEntry', request);
  assert.equal(db.create('FinanceEntry', request).id, first.id);
  assert.equal(db.filter('FinanceEntry').length, 1);
});

test('unsupported currency and forged ledger totals never enter or alter GBP accounts', t => {
  const { db, product } = fixture(t);
  assert.throws(() => db.update('RetailProduct', product.id, { currency:'EUR' }), /CURRENCY_UNSUPPORTED/);
  assert.throws(() => db.create('Invoice', { currency:'USD', items:[{ quantity:1, unit_price:20 }] }), /CURRENCY_UNSUPPORTED/);
  assert.throws(() => db.create('FinanceEntry', { amount:20, currency:'EUR', type:'income', operation_id:'finance-currency-operation-0001' }), /CURRENCY_UNSUPPORTED/);
  const entry = db.create('FinanceEntry', { amount:20, type:'income', category:'ceges', date:'2026-10-08', amount_minor:2000000 });
  assert.equal(entry.amount_minor, 2000);
  assert.throws(() => db.update('FinanceEntry', entry.id, { amount_minor:2000000 }), /AMOUNT_MINOR_DERIVED/);
  assert.throws(() => db.update('FinanceEntry', entry.id, { business_id:'nonexistent-business' }), /BUSINESS_NOT_FOUND/);
  const ledger = moduleHarness().load('src/lib/financialLedger.js');
  assert.throws(() => ledger.ledgerSummary([{ ...entry, date:'2026-10-99' }], '2026-10'), /DATE_INVALID/);
  assert.throws(() => ledger.ledgerSummary([{ ...entry, amount:1.001, amount_minor:100 }], '2026-10'), /ENTRY_INVALID/);
});
