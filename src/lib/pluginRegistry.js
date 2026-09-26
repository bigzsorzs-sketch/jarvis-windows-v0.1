/**
 * Jarvis Extension Registry
 *
 * Safe foundation for built-in and future external extensions.
 * This registry stores manifests/capability declarations only; it never downloads
 * or evals remote JavaScript. Executable providers must still be shipped/reviewed
 * through a Jarvis release or another explicitly trusted runtime boundary.
 */

const STORAGE_KEY = 'jarvis_extension_preferences_v1';
const extensions = new Map();

function loadPreferences() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function savePreferences(value) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch {}
}

function validateManifest(manifest) {
  if (!manifest?.id || !/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(manifest.id)) throw new Error('INVALID_EXTENSION_ID');
  if (!manifest?.name || typeof manifest.name !== 'string') throw new Error('INVALID_EXTENSION_NAME');
  if (!manifest?.version || typeof manifest.version !== 'string') throw new Error('INVALID_EXTENSION_VERSION');
  if (manifest.permissions && !Array.isArray(manifest.permissions)) throw new Error('INVALID_EXTENSION_PERMISSIONS');
  if (manifest.capabilities && !Array.isArray(manifest.capabilities)) throw new Error('INVALID_EXTENSION_CAPABILITIES');
}

export function registerExtension(manifest, runtime = null) {
  validateManifest(manifest);
  const normalized = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description || '',
    builtIn: Boolean(manifest.builtIn),
    required: Boolean(manifest.required),
    status: manifest.status || 'available',
    permissions: [...(manifest.permissions || [])],
    capabilities: [...(manifest.capabilities || [])],
    runtime,
  };
  extensions.set(normalized.id, normalized);
  return () => {
    if (!normalized.required) extensions.delete(normalized.id);
  };
}

export function listExtensions() {
  const prefs = loadPreferences();
  return [...extensions.values()].map((extension) => ({
    id: extension.id,
    name: extension.name,
    version: extension.version,
    description: extension.description,
    builtIn: extension.builtIn,
    required: extension.required,
    status: extension.status,
    permissions: [...extension.permissions],
    capabilities: [...extension.capabilities],
    enabled: extension.required ? true : prefs[extension.id]?.enabled !== false,
  }));
}

export function setExtensionEnabled(id, enabled) {
  const extension = extensions.get(id);
  if (!extension) throw new Error('EXTENSION_NOT_FOUND:' + id);
  if (extension.required && !enabled) throw new Error('REQUIRED_EXTENSION_CANNOT_BE_DISABLED');

  const prefs = loadPreferences();
  prefs[id] = { ...(prefs[id] || {}), enabled: Boolean(enabled) };
  savePreferences(prefs);
  return listExtensions().find((item) => item.id === id);
}

export function getExtensionRuntime(id) {
  const extension = extensions.get(id);
  const listed = listExtensions().find((item) => item.id === id);
  if (!extension || !listed?.enabled) return null;
  return extension.runtime || null;
}

const BUILT_INS = [
  {
    id: 'jarvis.context',
    name: 'Contextual Voice Core',
    version: '1.0.0',
    description: 'Hang, helyzetfelismerés és capability routing.',
    builtIn: true,
    required: true,
    status: 'ready',
    permissions: ['microphone'],
    capabilities: ['voice', 'context', 'actions'],
  },
  {
    id: 'jarvis.automotive',
    name: 'Automotive / OBD',
    version: '1.0.0',
    description: 'OBD-II diagnosztika és műhely asszisztens.',
    builtIn: true,
    status: 'hardware-dependent',
    permissions: ['serial', 'bluetooth'],
    capabilities: ['obd.read', 'vehicle.history', 'automotive.voice'],
  },
  {
    id: 'jarvis.navigation',
    name: 'Locations & Navigation',
    version: '1.0.0',
    description: 'Mentett helyek, útvonal-követés és hangos navigációs parancsok.',
    builtIn: true,
    status: 'ready',
    permissions: ['location'],
    capabilities: ['navigation', 'locations'],
  },
  {
    id: 'jarvis.vision',
    name: 'Vision & Images',
    version: '1.0.0',
    description: 'Képelemzés, képgenerálás és szerkesztési folyamatok.',
    builtIn: true,
    status: 'provider-required',
    permissions: ['files', 'network'],
    capabilities: ['vision', 'image.generate'],
  },
  {
    id: 'jarvis.health',
    name: 'Health / CGM',
    version: '1.0.0',
    description: 'Helyi vércukor-előzmény, demó CGM és provider adapterréteg.',
    builtIn: true,
    status: 'local-and-demo',
    permissions: ['health-data'],
    capabilities: ['glucose.read', 'cgm.providers'],
  },
];

for (const manifest of BUILT_INS) registerExtension(manifest);
