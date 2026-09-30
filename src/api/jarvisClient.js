// Jarvis local desktop data/API adapter.
// Desktop builds use native SQLite through Electron IPC.
// Browser/dev fallback remains localStorage for resilience.

const ENTITY_PREFIX = 'jarvis_entity_';
const USER_KEY = 'jarvis_local_user';
const MIGRATION_KEY = 'jarvis_sqlite_migration_v1';

function storage() {
  try { return window.localStorage; } catch { return null; }
}
function read(key, fallback) {
  try { const raw = storage()?.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { storage()?.setItem(key, JSON.stringify(value)); } catch {}
}
function id() {
  try { return crypto.randomUUID(); } catch { return Date.now() + '-' + Math.random().toString(36).slice(2); }
}
function now() { return new Date().toISOString(); }
function localUser() {
  const existing = read(USER_KEY, null);
  if (existing) return existing;
  const user = { id:'local-owner', email:'owner@jarvis.local', full_name:'Owner', role:'owner', created_date:now() };
  write(USER_KEY, user);
  return user;
}

function nativeData() {
  return window.jarvisDesktop?.data || null;
}

let migrationPromise = null;

async function ensureDesktopMigration() {
  const api = nativeData();
  if (!api?.importLegacy) return false;
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    if (storage()?.getItem(MIGRATION_KEY) === 'done') return true;

    const entities = {};
    const local = storage();
    if (local) {
      for (let i = 0; i < local.length; i += 1) {
        const key = local.key(i);
        if (!key?.startsWith(ENTITY_PREFIX)) continue;
        const entityName = key.slice(ENTITY_PREFIX.length);
        const rows = read(key, []);
        if (Array.isArray(rows) && rows.length) entities[entityName] = rows;
      }
    }

    const result = await api.importLegacy({ user: read(USER_KEY, null), entities });
    if (result?.success) {
      try { storage()?.setItem(MIGRATION_KEY, 'done'); } catch {}
      return true;
    }
    return false;
  })().catch((error) => {
    console.warn('Jarvis SQLite migration deferred:', error);
    migrationPromise = null;
    return false;
  });

  return migrationPromise;
}

function localEntityApi(entityName) {
  const key = ENTITY_PREFIX + entityName;
  const all = () => read(key, []);
  const save = (rows) => write(key, rows);

  return {
    async get(rowId) {
      const row = all().find((item) => item.id === rowId);
      return row ? structuredClone(row) : null;
    },
    async filter(query = {}, sort = null, limit = null) {
      let rows = all().filter((row) => Object.entries(query || {}).every(([k,v]) => row?.[k] === v));
      if (sort) {
        const desc = String(sort).startsWith('-');
        const field = desc ? String(sort).slice(1) : String(sort);
        rows.sort((a,b) => {
          const av = a?.[field] ?? '';
          const bv = b?.[field] ?? '';
          if (av === bv) return 0;
          return (av > bv ? 1 : -1) * (desc ? -1 : 1);
        });
      }
      if (Number.isFinite(limit)) rows = rows.slice(0, limit);
      return structuredClone(rows);
    },
    async search(text = '', query = {}, limit = 500) {
      const needle = String(text || '').trim().toLowerCase();
      let rows = all().filter((row) => Object.entries(query || {}).every(([k,v]) => row?.[k] === v));
      if (needle) rows = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
      rows.sort((a,b) => String(b?.created_date || '').localeCompare(String(a?.created_date || '')));
      return structuredClone(rows.slice(0, Math.max(1, Math.min(5000, Number(limit) || 500))));
    },
    async create(data = {}) {
      const user = localUser();
      const incoming = structuredClone(data);
      const row = {
        ...incoming,
        id:id(),
        created_date:now(),
        updated_date:now(),
        created_by:user.email
      };
      const rows = all();
      rows.push(row);
      save(rows);
      return structuredClone(row);
    },
    async update(rowId, patch = {}) {
      const rows = all();
      const index = rows.findIndex((row) => row.id === rowId);
      if (index < 0) throw new Error(entityName + ' not found: ' + rowId);
      const safePatch = structuredClone(patch);
      delete safePatch.id;
      delete safePatch.created_by;
      delete safePatch.created_date;
      delete safePatch.updated_date;
      rows[index] = { ...rows[index], ...safePatch, id:rowId, updated_date:now() };
      save(rows);
      return structuredClone(rows[index]);
    },
    async delete(rowId) {
      const rows = all();
      const next = rows.filter((row) => row.id !== rowId);
      save(next);
      return { success:next.length !== rows.length };
    }
  };
}

function entityApi(entityName) {
  const fallback = localEntityApi(entityName);

  return {
    async get(rowId) {
      const api = nativeData();
      if (!api?.filter) return fallback.get(rowId);
      await ensureDesktopMigration();
      const rows = await api.filter(entityName, { id: rowId }, null, 1);
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    },
    async filter(query = {}, sort = null, limit = null) {
      const api = nativeData();
      if (!api?.filter) return fallback.filter(query, sort, limit);
      await ensureDesktopMigration();
      return api.filter(entityName, query, sort, limit);
    },
    async search(text = '', query = {}, limit = 500) {
      const api = nativeData();
      if (!api?.search) return fallback.search(text, query, limit);
      await ensureDesktopMigration();
      return api.search(entityName, query, text, limit);
    },
    async create(data = {}) {
      const api = nativeData();
      if (!api?.create) return fallback.create(data);
      await ensureDesktopMigration();
      return api.create(entityName, data);
    },
    async update(rowId, patch = {}) {
      const api = nativeData();
      if (!api?.update) return fallback.update(rowId, patch);
      await ensureDesktopMigration();
      return api.update(entityName, rowId, patch);
    },
    async delete(rowId) {
      const api = nativeData();
      if (!api?.delete) return fallback.delete(rowId);
      await ensureDesktopMigration();
      return api.delete(entityName, rowId);
    }
  };
}

const entities = new Proxy({}, {
  get:(_target, prop) => entityApi(String(prop))
});

async function invoke(name, payload = {}) {
  if (window.jarvisDesktop?.invokeFunction) return window.jarvisDesktop.invokeFunction(name, payload);
  throw new Error('Desktop Jarvis function unavailable: ' + name);
}

export const jarvis = {
  auth: {
    async me() {
      const api = nativeData();
      if (!api?.getUser) return structuredClone(localUser());
      await ensureDesktopMigration();
      return api.getUser();
    },
    async isAuthenticated() {
      const current = await this.me().catch(() => null);
      return Boolean(current?.id);
    },
    async updateMe(patch = {}) {
      const api = nativeData();
      if (!api?.updateUser) {
        const user = { ...localUser(), ...patch, updated_date:now() };
        write(USER_KEY, user);
        return structuredClone(user);
      }
      await ensureDesktopMigration();
      return api.updateUser(patch);
    },
    async logout() {
      return { success:true, localOnly:true, reason:'LOCAL_SINGLE_OWNER_MODE' };
    },
    redirectToLogin() { return null; }
  },
  entities,
  functions: { invoke },
  integrations: {
    Core: {
      async UploadFile({ file }) {
        if (!file) throw new Error('Missing file');
        // Keep FileReader from allocating an oversized base64 payload before
        // the Electron-side validator can check it.
        if (typeof file.size === 'number' && file.size > 25 * 1024 * 1024) {
          throw new Error('FILE_TOO_LARGE');
        }
        const data = await new Promise((resolve,reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error || new Error('FILE_READ_FAILED'));
          reader.readAsDataURL(file);
        });
        // The main-process validator must be on the actual upload path; a
        // separately callable validator is not an upload security boundary.
        const result = await invoke('validateFileUpload', { file_url:data });
        const checked = result?.data;
        if (checked?.valid !== true || checked?.allowed !== true || !checked?.file_url) {
          throw new Error(String(checked?.reason || 'FILE_VALIDATION_FAILED'));
        }
        return {
          file_url:checked.file_url,
          name:file.name,
          size:checked.byte_size,
          type:checked.content_type
        };
      },
      async GenerateImage(params = {}) {
        const response = await invoke('generateImage', params);
        return response?.data || response;
      },
      async InvokeLLM(params = {}) {
        const result = await invoke('llmProxy', params);
        return result?.data?.result;
      }
    }
  },
  users: {
    async inviteUser() {
      throw new Error('LOCAL_SINGLE_OWNER_MODE');
    }
  },
  connectors: {
    async connectAppUser() {
      throw new Error('Connector setup is not available in the local desktop build yet.');
    }
  }
};

export default jarvis;
