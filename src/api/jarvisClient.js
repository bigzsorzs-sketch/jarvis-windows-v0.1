// Jarvis local desktop data/API adapter.
// No external platform SDK is required. Data is stored locally on the device.

const ENTITY_PREFIX = 'jarvis_entity_';
const USER_KEY = 'jarvis_local_user';

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
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
function now() { return new Date().toISOString(); }
function currentUser() {
  const existing = read(USER_KEY, null);
  if (existing) return existing;
  const user = { id:'local-owner', email:'owner@jarvis.local', full_name:'Owner', role:'owner', created_date:now() };
  write(USER_KEY, user);
  return user;
}

function entityApi(entityName) {
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
      const user = currentUser();
      const row = { id:id(), created_date:now(), updated_date:now(), created_by:data.created_by || user.email, ...structuredClone(data) };
      const rows = all(); rows.push(row); save(rows); return structuredClone(row);
    },
    async update(rowId, patch = {}) {
      const rows = all(); const i = rows.findIndex(r => r.id === rowId);
      if (i < 0) throw new Error(`${entityName} not found: ${rowId}`);
      rows[i] = { ...rows[i], ...structuredClone(patch), updated_date:now() }; save(rows); return structuredClone(rows[i]);
    },
    async delete(rowId) {
      const rows = all(); const next = rows.filter(r => r.id !== rowId); save(next); return { success:next.length !== rows.length };
    },
  };
}

const entities = new Proxy({}, { get:(_target, prop) => entityApi(String(prop)) });

async function invoke(name, payload = {}) {
  if (window.jarvisDesktop?.invokeFunction) return window.jarvisDesktop.invokeFunction(name, payload);
  throw new Error(`Desktop Jarvis function unavailable: ${name}`);
}

export const jarvis = {
  auth: {
    async me() { return structuredClone(currentUser()); },
    async isAuthenticated() { return true; },
    async updateMe(patch={}) { const u={...currentUser(),...patch,updated_date:now()}; write(USER_KEY,u); return structuredClone(u); },
    async logout() { return { success:true }; },
    redirectToLogin() { return null; },
  },
  entities,
  functions: { invoke },
  integrations: {
    Core: {
      async UploadFile({ file }) {
        if (!file) throw new Error('Missing file');
        const data = await new Promise((resolve,reject) => { const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); });
        return { file_url:data, name:file.name, size:file.size, type:file.type };
      },
      async GenerateImage(params={}) { return invoke('generateImage', params); },
      async InvokeLLM(params={}) { const r=await invoke('llmProxy',params); return r?.data?.result; },
    },
  },
  users: { async inviteUser(email, role='user') { return { success:true, email, role, localOnly:true }; } },
  connectors: {
    async connectAppUser() { throw new Error('Connector setup is not available in the local desktop build yet.'); }
  }
};

export default jarvis;
