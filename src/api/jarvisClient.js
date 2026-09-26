// Jarvis local desktop data/API adapter.
// Desktop builds use the Electron durable data store. Browser/dev fallback keeps
// the previous localStorage implementation so the UI remains testable without Electron.

const ENTITY_PREFIX = 'jarvis_entity_';
const USER_KEY = 'jarvis_local_user';
const BACKUP_PREFIX = 'jarvis_last_good:';
const MIGRATION_KEY = 'jarvis_desktop_data_migrated_v1';

let migrationPromise = null;

function storage() {
  try { return window.localStorage; } catch { return null; }
}

function desktopDataBridge() {
  const bridge = typeof window !== 'undefined' ? window.jarvisDesktop : null;
  return bridge?.entityFilter && bridge?.entityCreate ? bridge : null;
}

function read(key, fallback) {
  const store = storage();
  if (!store) return fallback;
  const raw = store.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    const backup = store.getItem(BACKUP_PREFIX + key);
    if (!backup) return fallback;
    try {
      const recovered = JSON.parse(backup);
      store.setItem(key, backup);
      return recovered;
    } catch {
      return fallback;
    }
  }
}

function write(key, value) {
  try {
    const store = storage();
    if (!store) return;
    const previous = store.getItem(key);
    if (previous) {
      try {
        JSON.parse(previous);
        store.setItem(BACKUP_PREFIX + key, previous);
      } catch {}
    }
    store.setItem(key, JSON.stringify(value));
  } catch {}
}

function id() {
  try { return crypto.randomUUID(); } catch { return Date.now() + '-' + Math.random().toString(36).slice(2); }
}

function now() { return new Date().toISOString(); }

function currentUserFallback() {
  const existing = read(USER_KEY, null);
  if (existing) return existing;
  const user = { id:'local-owner', email:'owner@jarvis.local', full_name:'Owner', role:'owner', created_date:now() };
  write(USER_KEY, user);
  return user;
}

function collectLegacyData() {
  const store = storage();
  const entities = {};
  if (!store) return { user: null, entities };

  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (!key?.startsWith(ENTITY_PREFIX)) continue;

    const entityName = key.slice(ENTITY_PREFIX.length);
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(entityName)) continue;

    const rows = read(key, []);
    if (Array.isArray(rows) && rows.length > 0) entities[entityName] = rows;
  }

  return {
    user: read(USER_KEY, null),
    entities,
  };
}

async function ensureDesktopMigration() {
  const bridge = desktopDataBridge();
  if (!bridge?.importLegacyData) return false;

  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const store = storage();
    if (store?.getItem(MIGRATION_KEY) === 'done') return true;

    try {
      const payload = collectLegacyData();
      const result = await bridge.importLegacyData(payload);
      store?.setItem(MIGRATION_KEY, 'done');
      console.info('[jarvisData] Legacy localStorage migration complete', result);
      return true;
    } catch (error) {
      console.warn('[jarvisData] Legacy migration failed, keeping fallback data intact', error?.message);
      // Do not mark complete; next launch may retry.
      return false;
    }
  })();

  return migrationPromise;
}

function fallbackEntityApi(entityName) {
  const key = ENTITY_PREFIX + entityName;
  const all = () => read(key, []);
  const save = (rows) => write(key, rows);

  return {
    async filter(query = {}, sort = null, limit = null) {
      let rows = all().filter(row => Object.entries(query || {}).every(([k,v]) => row?.[k] === v));
      if (sort) {
        const desc = String(sort).startsWith('-');
        const field = desc ? String(sort).slice(1) : String(sort);
        rows.sort((a,b) => {
          const av=a?.[field] ?? ''; const bv=b?.[field] ?? '';
          if (av === bv) return 0;
          return (av > bv ? 1 : -1) * (desc ? -1 : 1);
        });
      }
      if (Number.isFinite(limit)) rows = rows.slice(0, limit);
      return structuredClone(rows);
    },

    async create(data = {}) {
      const user = currentUserFallback();
      const row = {
        id:id(),
        created_date:now(),
        updated_date:now(),
        created_by:data.created_by || user.email,
        ...structuredClone(data),
      };
      const rows = all();
      rows.push(row);
      save(rows);
      return structuredClone(row);
    },

    async update(rowId, patch = {}) {
      const rows = all();
      const index = rows.findIndex(r => r.id === rowId);
      if (index < 0) throw new Error(entityName + ' not found: ' + rowId);
      rows[index] = { ...rows[index], ...structuredClone(patch), updated_date:now() };
      save(rows);
      return structuredClone(rows[index]);
    },

    async delete(rowId) {
      const rows = all();
      const next = rows.filter(r => r.id !== rowId);
      save(next);
      return { success:next.length !== rows.length };
    },
  };
}

function entityApi(entityName) {
  const fallback = fallbackEntityApi(entityName);

  return {
    async filter(query = {}, sort = null, limit = null) {
      const bridge = desktopDataBridge();
      if (!bridge) return fallback.filter(query, sort, limit);
      await ensureDesktopMigration();
      return bridge.entityFilter(entityName, query, sort, limit);
    },

    async create(data = {}) {
      const bridge = desktopDataBridge();
      if (!bridge) return fallback.create(data);
      await ensureDesktopMigration();
      return bridge.entityCreate(entityName, data);
    },

    async update(rowId, patch = {}) {
      const bridge = desktopDataBridge();
      if (!bridge) return fallback.update(rowId, patch);
      await ensureDesktopMigration();
      return bridge.entityUpdate(entityName, rowId, patch);
    },

    async delete(rowId) {
      const bridge = desktopDataBridge();
      if (!bridge) return fallback.delete(rowId);
      await ensureDesktopMigration();
      return bridge.entityDelete(entityName, rowId);
    },
  };
}

const entities = new Proxy({}, { get:(_target, prop) => entityApi(String(prop)) });

async function invoke(name, payload = {}) {
  if (window.jarvisDesktop?.invokeFunction) return window.jarvisDesktop.invokeFunction(name, payload);
  throw new Error('Desktop Jarvis function unavailable: ' + name);
}

async function getCurrentUser() {
  const bridge = desktopDataBridge();
  if (!bridge?.getLocalUser) return structuredClone(currentUserFallback());
  await ensureDesktopMigration();
  return bridge.getLocalUser();
}

export const jarvis = {
  auth: {
    async me() {
      return getCurrentUser();
    },

    async isAuthenticated() {
      return true;
    },

    async updateMe(patch={}) {
      const bridge = desktopDataBridge();
      if (!bridge?.updateLocalUser) {
        const user = { ...currentUserFallback(), ...patch, updated_date:now() };
        write(USER_KEY, user);
        return structuredClone(user);
      }
      await ensureDesktopMigration();
      return bridge.updateLocalUser(patch);
    },

    async logout() {
      return { success:true };
    },

    redirectToLogin() {
      return null;
    },
  },

  entities,

  functions: { invoke },

  integrations: {
    Core: {
      async UploadFile({ file }) {
        if (!file) throw new Error('Missing file');
        const data = await new Promise((resolve,reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        return { file_url:data, name:file.name, size:file.size, type:file.type };
      },

      async GenerateImage(params={}) {
        return invoke('generateImage', params);
      },

      async InvokeLLM(params={}) {
        const response = await invoke('llmProxy', params);
        return response?.data?.result;
      },
    },
  },

  users: {
    async inviteUser(email, role='user') {
      return { success:true, email, role, localOnly:true };
    },
  },

  connectors: {
    async connectAppUser() {
      throw new Error('Connector setup is not available in the local desktop build yet.');
    },
  },
};

export default jarvis;
