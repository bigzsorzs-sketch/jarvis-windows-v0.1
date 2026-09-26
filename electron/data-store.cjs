'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = 1;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date().toISOString();
}

function safeEntityName(name) {
  const value = String(name || '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(value)) throw new Error('INVALID_ENTITY_NAME');
  return value;
}

class JarvisDataStore {
  constructor({ rootDir, onEvent } = {}) {
    if (!rootDir) throw new Error('DATA_ROOT_REQUIRED');
    this.rootDir = rootDir;
    this.entitiesDir = path.join(rootDir, 'entities');
    this.userFile = path.join(rootDir, 'user.json');
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    fs.mkdirSync(this.entitiesDir, { recursive: true });
  }

  _entityFile(entityName) {
    return path.join(this.entitiesDir, safeEntityName(entityName) + '.json');
  }

  _defaultEntityDoc() {
    return { schemaVersion: SCHEMA_VERSION, updatedAt: now(), rows: [] };
  }

  _readDocument(file, fallback) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return parsed;
    } catch (error) {
      const backup = file + '.bak';
      try {
        const parsedBackup = JSON.parse(fs.readFileSync(backup, 'utf8'));
        this.onEvent('data-recovered-from-backup', { file: path.basename(file) });
        try { this._atomicWrite(file, parsedBackup, false); } catch {}
        return parsedBackup;
      } catch {
        if (fs.existsSync(file)) {
          this.onEvent('data-read-failed', { file: path.basename(file), message: error?.message || String(error) });
        }
        return clone(fallback);
      }
    }
  }

  _atomicWrite(file, value, createBackup = true) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = file + '.tmp-' + process.pid + '-' + Date.now();
    const text = JSON.stringify(value, null, 2);

    if (createBackup && fs.existsSync(file)) {
      try {
        JSON.parse(fs.readFileSync(file, 'utf8'));
        fs.copyFileSync(file, file + '.bak');
      } catch {}
    }

    const fd = fs.openSync(temp, 'w');
    try {
      fs.writeFileSync(fd, text, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    try {
      fs.renameSync(temp, file);
    } catch {
      // Windows can occasionally refuse replace-on-rename. The valid backup remains.
      try { fs.rmSync(file, { force: true }); } catch {}
      fs.renameSync(temp, file);
    }
  }

  _readEntity(entityName) {
    const file = this._entityFile(entityName);
    const doc = this._readDocument(file, this._defaultEntityDoc());
    if (!Array.isArray(doc.rows)) doc.rows = [];
    if (!doc.schemaVersion) doc.schemaVersion = SCHEMA_VERSION;
    return doc;
  }

  _writeEntity(entityName, doc) {
    const file = this._entityFile(entityName);
    const next = {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: now(),
      rows: Array.isArray(doc.rows) ? doc.rows : [],
    };
    this._atomicWrite(file, next);
    return next;
  }

  filter(entityName, query = {}, sort = null, limit = null) {
    const doc = this._readEntity(entityName);
    let rows = doc.rows.filter((row) =>
      Object.entries(query || {}).every(([key, value]) => row?.[key] === value)
    );

    if (sort) {
      const desc = String(sort).startsWith('-');
      const field = desc ? String(sort).slice(1) : String(sort);
      rows = [...rows].sort((a, b) => {
        const av = a?.[field] ?? '';
        const bv = b?.[field] ?? '';
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * (desc ? -1 : 1);
      });
    }

    const n = Number(limit);
    if (Number.isFinite(n) && n >= 0) rows = rows.slice(0, n);
    return clone(rows);
  }

  create(entityName, data = {}, ownerEmail = 'owner@jarvis.local') {
    const doc = this._readEntity(entityName);
    const row = {
      id: crypto.randomUUID(),
      created_date: now(),
      updated_date: now(),
      created_by: data.created_by || ownerEmail,
      ...clone(data),
    };
    doc.rows.push(row);
    this._writeEntity(entityName, doc);
    return clone(row);
  }

  update(entityName, rowId, patch = {}) {
    const doc = this._readEntity(entityName);
    const index = doc.rows.findIndex((row) => row.id === rowId);
    if (index < 0) throw new Error(entityName + ' not found: ' + rowId);
    doc.rows[index] = { ...doc.rows[index], ...clone(patch), updated_date: now() };
    this._writeEntity(entityName, doc);
    return clone(doc.rows[index]);
  }

  delete(entityName, rowId) {
    const doc = this._readEntity(entityName);
    const before = doc.rows.length;
    doc.rows = doc.rows.filter((row) => row.id !== rowId);
    if (doc.rows.length !== before) this._writeEntity(entityName, doc);
    return { success: doc.rows.length !== before };
  }

  getUser() {
    const fallback = {
      schemaVersion: SCHEMA_VERSION,
      user: {
        id: 'local-owner',
        email: 'owner@jarvis.local',
        full_name: 'Owner',
        role: 'owner',
        created_date: now(),
      },
    };
    const doc = this._readDocument(this.userFile, fallback);
    if (!doc.user) doc.user = fallback.user;
    return clone(doc.user);
  }

  updateUser(patch = {}) {
    const current = this.getUser();
    const user = { ...current, ...clone(patch), updated_date: now() };
    this._atomicWrite(this.userFile, { schemaVersion: SCHEMA_VERSION, updatedAt: now(), user });
    return clone(user);
  }

  importLegacy({ user, entities } = {}) {
    let importedEntities = 0;
    let importedRows = 0;

    if (user && !fs.existsSync(this.userFile)) {
      this._atomicWrite(this.userFile, {
        schemaVersion: SCHEMA_VERSION,
        updatedAt: now(),
        user: clone(user),
      }, false);
    }

    for (const [entityName, rows] of Object.entries(entities || {})) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const file = this._entityFile(entityName);
      const existing = this._readEntity(entityName);
      if (existing.rows.length > 0 || fs.existsSync(file)) continue;

      this._writeEntity(entityName, {
        schemaVersion: SCHEMA_VERSION,
        rows: clone(rows),
      });
      importedEntities += 1;
      importedRows += rows.length;
    }

    this.onEvent('legacy-data-import', { importedEntities, importedRows });
    return { success: true, importedEntities, importedRows };
  }

  status() {
    let entityFiles = [];
    try {
      entityFiles = fs.readdirSync(this.entitiesDir).filter((name) => name.endsWith('.json'));
    } catch {}

    return {
      schemaVersion: SCHEMA_VERSION,
      rootDir: this.rootDir,
      entityCount: entityFiles.length,
      userExists: fs.existsSync(this.userFile),
    };
  }
}

module.exports = { JarvisDataStore, SCHEMA_VERSION };
