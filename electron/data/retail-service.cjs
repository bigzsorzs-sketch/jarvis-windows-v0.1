'use strict';

const crypto = require('node:crypto');

function number(value, name, min = 0, max = 100000000) {
  if (value === '' || value == null || typeof value === 'boolean') throw new Error(name + '_INVALID');
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(name + '_INVALID');
  return n;
}
function integer(value, name, min = 0) {
  const n = number(value, name, min);
  if (!Number.isSafeInteger(n)) throw new Error(name + '_INVALID');
  return n;
}
function money(value, name) {
  const n = number(value, name);
  const minor = Math.round(n * 100);
  if (Math.abs(n * 100 - minor) > 0.00001) throw new Error(name + '_PRECISION');
  return minor;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('DATE_INVALID');
  const parsed = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error('DATE_INVALID');
  return value;
}
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function get(db, entity, id) {
  return db.filter(entity, { id }, null, 1)[0] || null;
}
function owned(db, entity, id) {
  const row = get(db, entity, id);
  if (!row || row.created_by !== db.getUser().email) throw new Error(entity.toUpperCase() + '_NOT_FOUND');
  return row;
}
function currency(value) {
  if (value != null && value !== 'GBP') throw new Error('CURRENCY_UNSUPPORTED_GBP_ONLY');
  return 'GBP';
}
function validateProduct(patch) {
  currency(patch.currency);
  for (const field of ['stock', 'min_stock']) if (patch[field] != null) integer(patch[field], field.toUpperCase());
  for (const field of ['price', 'cost']) if (patch[field] != null) money(patch[field], field.toUpperCase());
}
function operation(db, kind, request, action) {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(String(request.operation_id || ''))) throw new Error('OPERATION_ID_REQUIRED');
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ kind, owner:db.getUser().email, ...request })).digest('hex');
  return db.db.transaction(() => {
    const previous = db.filter('RetailOperation', { operation_id:request.operation_id }, null, 1)[0];
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error('OPERATION_ID_CONFLICT');
      return { ...previous.result, replayed:true };
    }
    const result = action();
    db._create('RetailOperation', { operation_id:request.operation_id, fingerprint, result });
    return result;
  }).immediate();
}

function recordSale(db, incoming = {}) {
  const request = {
    operation_id:String(incoming.operation_id || ''), product_id:String(incoming.product_id || ''),
    quantity:integer(incoming.quantity, 'QUANTITY', 1), discount:number(incoming.discount ?? 0, 'DISCOUNT', 0, 100),
    date:date(incoming.date || localToday()),
  };
  const basisPoints = money(request.discount, 'DISCOUNT');
  return operation(db, 'sale', request, () => {
    const product = owned(db, 'RetailProduct', request.product_id);
    currency(product.currency);
    const stock = integer(product.stock, 'STOCK');
    if (stock < request.quantity) throw new Error('INSUFFICIENT_STOCK');
    if (product.business_id) owned(db, 'Business', product.business_id);
    const unit = money(product.price, 'PRICE');
    const cost = money(product.cost ?? 0, 'COST');
    const gross = unit * request.quantity;
    const costTotal = cost * request.quantity;
    if (!Number.isSafeInteger(gross * 10000) || !Number.isSafeInteger(costTotal)) throw new Error('SALE_AMOUNT_TOO_LARGE');
    const revenue = Math.round(gross * (10000 - basisPoints) / 10000);
    const sale = db._create('RetailSale', {
      ...request, product_name:product.name, business_id:product.business_id || null,
      currency:'GBP', status:'completed', payment_status:'paid', unit_price:unit / 100,
      revenue:revenue / 100, cost_of_goods:costTotal / 100, profit:(revenue - costTotal) / 100,
      revenue_minor:revenue, cost_minor:costTotal,
    });
    const updated = db._update('RetailProduct', product.id, { stock:stock - request.quantity });
    const entry = db._create('FinanceEntry', {
      description:`Eladás: ${product.name} (${request.quantity} db)`, amount:revenue / 100,
      amount_minor:revenue, type:'income', category:'ceges', currency:'GBP', date:request.date,
      business_id:sale.business_id, source:'retail-sale', source_sale_id:sale.id,
    });
    return { success:true, sale, product:updated, entry };
  });
}

function voidSale(db, incoming = {}) {
  const request = { operation_id:String(incoming.operation_id || ''), sale_id:String(incoming.sale_id || ''), date:date(incoming.date || localToday()) };
  return operation(db, 'return', request, () => {
    const sale = owned(db, 'RetailSale', request.sale_id);
    if (sale.status === 'voided') throw new Error('SALE_ALREADY_VOIDED');
    if (!sale.operation_id || sale.status !== 'completed') throw new Error('LEGACY_SALE_REQUIRES_RECONCILIATION');
    const entry = db.filter('FinanceEntry', { source_sale_id:sale.id, source:'retail-sale' }, null, 1)[0];
    if (!entry || entry.amount_minor !== sale.revenue_minor) throw new Error('SALE_LEDGER_MISMATCH');
    const product = owned(db, 'RetailProduct', sale.product_id);
    const stock = integer(product.stock, 'STOCK') + integer(sale.quantity, 'QUANTITY', 1);
    integer(stock, 'STOCK');
    const updated = db._update('RetailProduct', product.id, { stock });
    const refund = db._create('FinanceEntry', {
      description:`Visszáru: ${sale.product_name}`, amount:sale.revenue, amount_minor:sale.revenue_minor,
      type:'expense', category:'ceges', currency:'GBP', date:request.date,
      business_id:sale.business_id, source:'retail-return', source_sale_id:sale.id, reverses_entry_id:entry.id,
    });
    const voided = db._update('RetailSale', sale.id, { status:'voided', voided_date:request.date, return_operation_id:request.operation_id });
    return { success:true, sale:voided, product:updated, entry:refund };
  });
}

function adjustStock(db, incoming = {}) {
  const absolute = incoming.stock != null;
  const request = {
    operation_id:String(incoming.operation_id || ''), product_id:String(incoming.product_id || ''),
    ...(absolute ? { stock:integer(incoming.stock, 'STOCK'), expected_stock:integer(incoming.expected_stock, 'EXPECTED_STOCK') }
      : { quantity:integer(incoming.quantity, 'QUANTITY', 1), direction:incoming.direction }),
  };
  if (!absolute && !['in', 'out'].includes(request.direction)) throw new Error('STOCK_DIRECTION_INVALID');
  return operation(db, 'stock', request, () => {
    const product = owned(db, 'RetailProduct', request.product_id);
    const old = integer(product.stock, 'STOCK');
    if (absolute && old !== request.expected_stock) throw new Error('STOCK_CHANGED_RELOAD');
    const stock = absolute ? request.stock : old + (request.direction === 'in' ? request.quantity : -request.quantity);
    if (stock < 0) throw new Error('INSUFFICIENT_STOCK');
    integer(stock, 'STOCK');
    const updated = db._update('RetailProduct', product.id, { stock });
    db._create('RetailStockMovement', { ...request, previous_stock:old, stock, date:localToday() });
    return { success:true, product:updated };
  });
}

function invoiceData(data) {
  currency(data.currency);
  if (!Array.isArray(data.items) || !data.items.length || data.items.length > 1000) throw new Error('INVOICE_ITEMS_REQUIRED');
  const items = data.items.map(item => {
    const quantity = number(item.quantity, 'INVOICE_QUANTITY', 0.000001, 1000000);
    const unit = money(item.unit_price, 'INVOICE_PRICE');
    const minor = Math.round(quantity * unit);
    if (!Number.isSafeInteger(minor)) throw new Error('INVOICE_AMOUNT_TOO_LARGE');
    return { ...item, quantity, unit_price:unit / 100, total:minor / 100 };
  });
  const minor = items.reduce((sum,item) => sum + Math.round(item.total * 100), 0);
  if (!Number.isSafeInteger(minor)) throw new Error('INVOICE_AMOUNT_TOO_LARGE');
  if (data.issue_date) date(data.issue_date);
  if (data.due_date) date(data.due_date);
  return { ...data, items, total_amount:minor / 100, currency:'GBP' };
}

function recordInvoicePayment(db, incoming = {}) {
  const request = { operation_id:String(incoming.operation_id || ''), invoice_id:String(incoming.invoice_id || ''), date:date(incoming.date || localToday()) };
  return operation(db, 'invoice-payment', request, () => {
    const invoice = owned(db, 'Invoice', request.invoice_id);
    currency(invoice.currency);
    if (invoice.payment_entry_id) {
      const entry = owned(db, 'FinanceEntry', invoice.payment_entry_id);
      return { success:true, invoice, entry, replayed:true };
    }
    if (invoice.status === 'kifizetve') throw new Error('LEGACY_INVOICE_PAYMENT_REQUIRES_RECONCILIATION');
    if (invoice.business_id) owned(db, 'Business', invoice.business_id);
    const amount = money(invoice.total_amount, 'INVOICE_TOTAL');
    const entry = db._create('FinanceEntry', { description:`Számlafizetés: ${invoice.invoice_number}`, amount:amount / 100, amount_minor:amount,
      type:'income', category:'ceges', currency:'GBP', date:request.date, business_id:invoice.business_id || null, source:'invoice-payment', source_invoice_id:invoice.id });
    const updated = db._update('Invoice', invoice.id, { status:'kifizetve', payment_entry_id:entry.id, payment_date:request.date });
    return { success:true, invoice:updated, entry };
  });
}

function recordFinance(db, data) {
  currency(data.currency);
  const request = { operation_id:String(data.operation_id || ''), description:String(data.description || '').trim(),
    amount:money(data.amount, 'AMOUNT') / 100, type:data.type, category:data.category || 'magan',
    date:date(data.date || localToday()), business_id:data.category === 'ceges' ? data.business_id || null : null, currency:'GBP' };
  if (!request.description || !['income','expense'].includes(request.type) || !['ceges','magan'].includes(request.category)) throw new Error('FINANCE_ENTRY_INVALID');
  return operation(db, 'manual-finance', request, () => {
    if (request.business_id) owned(db, 'Business', request.business_id);
    return { success:true, entry:db._create('FinanceEntry', { ...request, amount_minor:Math.round(request.amount * 100), source:'manual' }) };
  });
}

module.exports = { recordSale, voidSale, adjustStock, recordInvoicePayment, recordFinance, invoiceData, validateProduct, money, date, currency };
