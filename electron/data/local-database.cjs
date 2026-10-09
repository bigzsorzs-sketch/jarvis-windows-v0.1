'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const retail = require('./retail-service.cjs');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date().toISOString();
}

class LocalDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.open();
  }

  open() {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec([
      'CREATE TABLE IF NOT EXISTS entities (',
      '  entity TEXT NOT NULL,',
      '  id TEXT NOT NULL,',
      '  created_date TEXT,',
      '  updated_date TEXT,',
      '  created_by TEXT,',
      '  json TEXT NOT NULL,',
      '  PRIMARY KEY (entity, id)',
      ');',
      'CREATE INDEX IF NOT EXISTS idx_entities_entity ON entities(entity);',
      'CREATE INDEX IF NOT EXISTS idx_entities_created ON entities(entity, created_date);',
      'CREATE TABLE IF NOT EXISTS meta (',
      '  key TEXT PRIMARY KEY,',
      '  value TEXT NOT NULL',
      ');'
    ].join('\n'));
  }

  ensureOpen() {
    if (!this.db?.open) this.open();
  }

  getMeta(key, fallback = null) {
    this.ensureOpen();
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch { return fallback; }
  }

  setMeta(key, value) {
    this.ensureOpen();
    this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, JSON.stringify(value));
  }

  getUser() {
    const existing = this.getMeta('local_user', null);
    if (existing) return clone(existing);
    const user = {
      id: 'local-owner',
      email: 'owner@jarvis.local',
      full_name: 'Owner',
      role: 'owner',
      created_date: now()
    };
    this.setMeta('local_user', user);
    return clone(user);
  }

  updateUser(patch = {}) {
    const current = this.getUser();
    const safePatch = { ...clone(patch) };
    delete safePatch.id;
    delete safePatch.role;
    delete safePatch.created_date;
    const user = { ...current, ...safePatch, id:'local-owner', role:'owner', updated_date: now() };
    this.setMeta('local_user', user);
    return clone(user);
  }

  filter(entity, query = {}, sort = null, limit = null) {
    this.ensureOpen();
    let rows = this.db.prepare('SELECT json FROM entities WHERE entity = ?').all(String(entity))
      .map((row) => JSON.parse(row.json));

    rows = rows.filter((row) => Object.entries(query || {}).every(([key, value]) => row?.[key] === value));

    if (sort) {
      const desc = String(sort).startsWith('-');
      const field = desc ? String(sort).slice(1) : String(sort);
      rows.sort((a, b) => {
        const av = a?.[field] ?? '';
        const bv = b?.[field] ?? '';
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * (desc ? -1 : 1);
      });
    }

    if (Number.isFinite(limit)) rows = rows.slice(0, Number(limit));
    return clone(rows);
  }

  search(entity, query = {}, text = '', limit = 500) {
    this.ensureOpen();
    const needle = String(text || '').trim().toLocaleLowerCase('hu-HU');
    if (!needle) return this.filter(entity, query, '-created_date', limit);

    const cap = Math.max(1, Math.min(5000, Number(limit) || 500));
    const rows = this.db.prepare(
      'SELECT json FROM entities WHERE entity = ? ORDER BY created_date DESC'
    ).all(String(entity))
      .map((row) => JSON.parse(row.json))
      .filter((row) => Object.entries(query || {}).every(([key, value]) => row?.[key] === value))
      .filter((row) => JSON.stringify(row).toLocaleLowerCase('hu-HU').includes(needle)).slice(0, cap);

    return clone(rows);
  }

  create(entity, data = {}) {
    if (entity === 'RetailSale' || entity === 'RetailOperation' || entity === 'EmailDelivery') throw new Error('USE_MANAGED_OPERATION');
    if (entity === 'Invoice') {
      if (data.status === 'kifizetve' || data.payment_entry_id) throw new Error('USE_INVOICE_PAYMENT');
      data = retail.invoiceData(data);
      if (data.business_id && !this.filter('Business', { id:data.business_id, created_by:this.getUser().email }).length) throw new Error('BUSINESS_NOT_FOUND');
    }
    if (entity === 'RetailProduct') {
      retail.validateProduct(data);
      if (data.business_id && !this.filter('Business', { id:data.business_id, created_by:this.getUser().email }).length) throw new Error('BUSINESS_NOT_FOUND');
    }
    if (entity === 'FinanceEntry') {
      if (data.source_sale_id || data.source_invoice_id) throw new Error('LINKED_LEDGER_MANAGED');
      if (data.operation_id) return retail.recordFinance(this, data).entry;
      data = { ...data, currency:retail.currency(data.currency), amount_minor:retail.money(data.amount, 'AMOUNT') };
      if (!['income', 'expense'].includes(data.type)) throw new Error('FINANCE_TYPE_INVALID');
      if (data.category != null && !['ceges', 'magan'].includes(data.category)) throw new Error('FINANCE_CATEGORY_INVALID');
      if (data.date) retail.date(data.date);
      if (data.business_id && !this.filter('Business', { id:data.business_id, created_by:this.getUser().email }).length) throw new Error('BUSINESS_NOT_FOUND');
    }
    return this._create(entity, data);
  }

  _create(entity, data = {}) {
    this.ensureOpen();
    const user = this.getUser();
    const incoming = clone(data);
    const row = {
      ...incoming,
      id: crypto.randomUUID(),
      created_date: now(),
      updated_date: now(),
      created_by: user.email
    };

    this.db.prepare([
      'INSERT INTO entities(entity,id,created_date,updated_date,created_by,json)',
      'VALUES(@entity,@id,@created_date,@updated_date,@created_by,@json)'
    ].join(' ')).run({
      entity: String(entity),
      id: row.id,
      created_date: row.created_date || null,
      updated_date: row.updated_date || null,
      created_by: row.created_by || null,
      json: JSON.stringify(row)
    });

    return clone(row);
  }

  update(entity, id, patch = {}) {
    if (entity === 'Invoice') {
      retail.currency(patch.currency);
      if (patch.business_id && !this.filter('Business', { id:patch.business_id, created_by:this.getUser().email }).length) throw new Error('BUSINESS_NOT_FOUND');
      for (const key of ['issue_date', 'due_date']) if (patch[key]) retail.date(patch[key]);
      const current = this.filter(entity, { id }, null, 1)[0];
      if (current?.payment_entry_id) {
        if (patch.status === 'kifizetve' && Object.keys(patch).length === 1) return current;
        throw new Error('PAID_INVOICE_LOCKED');
      }
      if (patch.status === 'kifizetve') {
        if (Object.keys(patch).length !== 1) throw new Error('USE_INVOICE_PAYMENT');
        return retail.recordInvoicePayment(this, { invoice_id:id, operation_id:'invoice-payment-' + id }).invoice;
      }
      if (patch.payment_entry_id) throw new Error('USE_INVOICE_PAYMENT');
      if (patch.items) patch = retail.invoiceData({ ...current, ...patch });
      else if (patch.total_amount != null) throw new Error('INVOICE_TOTAL_DERIVED_FROM_ITEMS');
    }
    this.assertUnmanaged(entity, id);
    if (entity === 'RetailProduct') retail.validateProduct(patch);
    if (['RetailProduct', 'FinanceEntry'].includes(entity) && patch.business_id && !this.filter('Business', { id:patch.business_id, created_by:this.getUser().email }).length) throw new Error('BUSINESS_NOT_FOUND');
    if (entity === 'FinanceEntry') {
      retail.currency(patch.currency);
      if (patch.source_sale_id || patch.source_invoice_id) throw new Error('LINKED_LEDGER_MANAGED');
      if (patch.amount_minor != null && patch.amount == null) throw new Error('AMOUNT_MINOR_DERIVED');
      if (patch.amount != null) patch = { ...patch, amount_minor:retail.money(patch.amount, 'AMOUNT') };
      if (patch.date) retail.date(patch.date);
      if (patch.type != null && !['income', 'expense'].includes(patch.type)) throw new Error('FINANCE_TYPE_INVALID');
      if (patch.category != null && !['ceges', 'magan'].includes(patch.category)) throw new Error('FINANCE_CATEGORY_INVALID');
    }
    return this._update(entity, id, patch);
  }

  _update(entity, id, patch = {}) {
    this.ensureOpen();
    const current = this.db.prepare('SELECT json FROM entities WHERE entity = ? AND id = ?')
      .get(String(entity), String(id));
    if (!current) throw new Error(String(entity) + ' not found: ' + String(id));

    const currentRow = JSON.parse(current.json);
    const safePatch = clone(patch);
    delete safePatch.id;
    delete safePatch.created_by;
    delete safePatch.created_date;
    delete safePatch.updated_date;
    const row = {
      ...currentRow,
      ...safePatch,
      id:String(id),
      created_by:currentRow.created_by,
      created_date:currentRow.created_date,
      updated_date:now()
    };
    this.db.prepare([
      'UPDATE entities SET created_date=@created_date,updated_date=@updated_date,created_by=@created_by,json=@json',
      'WHERE entity=@entity AND id=@id'
    ].join(' ')).run({
      entity: String(entity),
      id: String(id),
      created_date: row.created_date || null,
      updated_date: row.updated_date || null,
      created_by: row.created_by || null,
      json: JSON.stringify(row)
    });
    return clone(row);
  }

  delete(entity, id) {
    this.assertUnmanaged(entity, id);
    if (entity === 'Invoice' && this.filter(entity, { id }, null, 1)[0]?.payment_entry_id) throw new Error('PAID_INVOICE_LOCKED');
    if (entity === 'Business' && ['FinanceEntry','RetailProduct','Invoice'].some(kind => this.filter(kind, { business_id:id }).length)) throw new Error('BUSINESS_HAS_LINKED_DATA');
    if (entity === 'RetailProduct' && this.filter('RetailSale', { product_id:id, status:'completed' }).length) throw new Error('PRODUCT_HAS_ACTIVE_SALES');
    this.ensureOpen();
    const result = this.db.prepare('DELETE FROM entities WHERE entity = ? AND id = ?')
      .run(String(entity), String(id));
    return { success: result.changes > 0 };
  }

  assertUnmanaged(entity, id) {
    if (entity === 'RetailSale' || entity === 'RetailOperation' || entity === 'EmailDelivery') throw new Error('RETAIL_SALE_MANAGED');
    const row = entity === 'FinanceEntry' ? this.filter(entity, { id }, null, 1)[0] : null;
    if (row?.source_sale_id || row?.source_invoice_id) throw new Error('RETAIL_LEDGER_MANAGED');
  }

  recordRetailSale(request) { return retail.recordSale(this, request); }
  voidRetailSale(request) { return retail.voidSale(this, request); }
  adjustRetailStock(request) { return retail.adjustStock(this, request); }
  recordInvoicePayment(request) { return retail.recordInvoicePayment(this, request); }

  importLegacy(snapshot = {}) {
    this.ensureOpen();
    let imported = 0;
    const insert = this.db.prepare([
      'INSERT OR IGNORE INTO entities(entity,id,created_date,updated_date,created_by,json)',
      'VALUES(@entity,@id,@created_date,@updated_date,@created_by,@json)'
    ].join(' '));

    const tx = this.db.transaction(() => {
      for (const [entity, rows] of Object.entries(snapshot.entities || {})) {
        if (!Array.isArray(rows)) continue;
        for (const source of rows) {
          const row = { ...clone(source) };
          if (!row.id) row.id = crypto.randomUUID();
          if (!row.created_date) row.created_date = now();
          if (!row.updated_date) row.updated_date = row.created_date;
          const result = insert.run({
            entity: String(entity),
            id: String(row.id),
            created_date: row.created_date || null,
            updated_date: row.updated_date || null,
            created_by: row.created_by || null,
            json: JSON.stringify(row)
          });
          imported += result.changes;
        }
      }
      if (snapshot.user) {
        const restoredUser = clone(snapshot.user);
        this.setMeta('local_user', {
          ...restoredUser,
          id:'local-owner',
          role:'owner',
          email:String(restoredUser?.email || 'owner@jarvis.local'),
          created_date:restoredUser?.created_date || now(),
          updated_date:now()
        });
      }
      this.setMeta('legacy_localstorage_migrated_at', now());
    });
    tx();
    return { success: true, imported };
  }

  stats() {
    this.ensureOpen();
    const entityCount = this.db.prepare('SELECT COUNT(*) AS count FROM entities').get().count;
    const groups = this.db.prepare('SELECT entity, COUNT(*) AS count FROM entities GROUP BY entity ORDER BY count DESC').all();
    return {
      databasePath: this.dbPath,
      entityCount,
      groups,
      wal: String(this.db.pragma('journal_mode', { simple: true })),
      integrity: this.db.pragma('quick_check', { simple: true })
    };
  }

  exportSnapshot() {
    this.ensureOpen();
    const entities = {};
    const rows = this.db.prepare('SELECT entity,json FROM entities ORDER BY entity,created_date').all();
    for (const row of rows) {
      if (!entities[row.entity]) entities[row.entity] = [];
      entities[row.entity].push(JSON.parse(row.json));
    }
    return {
      version: 1,
      exported_at: now(),
      user: this.getUser(),
      entities
    };
  }

  importSnapshot(snapshot = {}) {
    this.ensureOpen();
    if (!snapshot || typeof snapshot !== 'object' || !snapshot.entities || typeof snapshot.entities !== 'object') {
      throw new Error('BACKUP_SNAPSHOT_INVALID');
    }

    const insert = this.db.prepare([
      'INSERT INTO entities(entity,id,created_date,updated_date,created_by,json)',
      'VALUES(@entity,@id,@created_date,@updated_date,@created_by,@json)'
    ].join(' '));
    let imported = 0;

    const restore = this.db.transaction(() => {
      this.db.prepare('DELETE FROM entities').run();
      this.db.prepare('DELETE FROM meta WHERE key = ?').run('local_user');

      for (const [entity, rows] of Object.entries(snapshot.entities)) {
        if (!Array.isArray(rows)) throw new Error('BACKUP_ENTITY_ROWS_INVALID:' + String(entity));
        for (const source of rows) {
          if (!source || typeof source !== 'object' || Array.isArray(source)) {
            throw new Error('BACKUP_ENTITY_ROW_INVALID:' + String(entity));
          }
          const row = { ...clone(source) };
          if (!row.id) throw new Error('BACKUP_ENTITY_ID_MISSING:' + String(entity));
          if (!row.created_date) row.created_date = now();
          if (!row.updated_date) row.updated_date = row.created_date;
          const result = insert.run({
            entity: String(entity),
            id: String(row.id),
            created_date: row.created_date || null,
            updated_date: row.updated_date || null,
            created_by: row.created_by || null,
            json: JSON.stringify(row)
          });
          imported += result.changes;
        }
      }

      if (snapshot.user) {
        const restoredUser = clone(snapshot.user);
        this.setMeta('local_user', {
          ...restoredUser,
          id:'local-owner',
          role:'owner',
          email:String(restoredUser?.email || 'owner@jarvis.local'),
          created_date:restoredUser?.created_date || now(),
          updated_date:now()
        });
      }
      this.setMeta('last_backup_restore_at', now());

      const integrity = this.db.pragma('quick_check', { simple: true });
      if (integrity !== 'ok') throw new Error('SQLITE_RESTORE_INTEGRITY_FAILED:' + String(integrity));
    });

    restore();
    return { success: true, imported };
  }

  healthCheck() {
    this.ensureOpen();
    const before = this.getMeta('__health_probe__', null);
    const probe = { at: Date.now(), nonce: crypto.randomUUID() };
    this.setMeta('__health_probe__', probe);
    const after = this.getMeta('__health_probe__', null);
    if (!after || after.nonce !== probe.nonce) throw new Error('SQLITE_WRITE_READ_FAILED');
    if (before == null) this.db.prepare('DELETE FROM meta WHERE key = ?').run('__health_probe__');
    else this.setMeta('__health_probe__', before);
    return this.stats();
  }

  resetAll() {
    this.ensureOpen();
    this.db.prepare('DELETE FROM entities').run();
    this.db.prepare('DELETE FROM meta').run();
    return { success: true };
  }

  close() {
    if (this.db?.open) this.db.close();
  }
}

module.exports = { LocalDatabase };
