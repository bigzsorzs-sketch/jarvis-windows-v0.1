const BACKUP_PREFIX = 'jarvis_secure_backup:';
const LEGACY_DEVICE_SECRET_KEY = 'jarvis_secure_backup_device_secret';
const KEY_DB_NAME = 'jarvis_secure_keystore_v1';
const KEY_STORE_NAME = 'keys';
const KEY_ID = 'backup-pbkdf2-key-material';

function bytesToBase64(bytes) {
  const view = new Uint8Array(bytes);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < view.length; offset += chunkSize) {
    binary += String.fromCharCode(...view.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function openKeyDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(KEY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
        db.createObjectStore(KEY_STORE_NAME, { keyPath:'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('SECURE_BACKUP_KEYSTORE_OPEN_FAILED'));
  });
}

async function readStoredKeyMaterial() {
  const db = await openKeyDb();
  if (!db) return null;
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(KEY_STORE_NAME, 'readonly');
      const request = tx.objectStore(KEY_STORE_NAME).get(KEY_ID);
      request.onsuccess = () => resolve(request.result?.key || null);
      request.onerror = () => reject(request.error || new Error('SECURE_BACKUP_KEYSTORE_READ_FAILED'));
    });
  } finally {
    db.close();
  }
}

async function storeKeyMaterial(key) {
  const db = await openKeyDb();
  if (!db) throw new Error('SECURE_BACKUP_KEYSTORE_UNAVAILABLE');
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(KEY_STORE_NAME, 'readwrite');
      const request = tx.objectStore(KEY_STORE_NAME).put({ id:KEY_ID, key, updatedAt:Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('SECURE_BACKUP_KEYSTORE_WRITE_FAILED'));
    });
  } finally {
    db.close();
  }
}

async function getKeyMaterial() {
  const stored = await readStoredKeyMaterial();
  if (stored) return stored;

  const legacySecret = localStorage.getItem(LEGACY_DEVICE_SECRET_KEY);
  const rawBytes = legacySecret
    ? base64ToBytes(legacySecret)
    : crypto.getRandomValues(new Uint8Array(32));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    rawBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Persist only a non-extractable CryptoKey. Existing v1 backups remain
  // decryptable because legacy raw material is migrated before it is removed.
  await storeKeyMaterial(keyMaterial);
  if (legacySecret) localStorage.removeItem(LEGACY_DEVICE_SECRET_KEY);
  return keyMaterial;
}

async function getBackupKey(scope = 'default') {
  const encoder = new TextEncoder();
  const keyMaterial = await getKeyMaterial();

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(`jarvis-local-backup:${window.location.origin}:${scope}`),
      iterations: 150000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function saveEncryptedLocalBackup(name, payload, scope = 'default') {
  if (!crypto?.subtle || typeof indexedDB === 'undefined' || !payload) return false;

  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getBackupKey(scope);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify({ payload, saved_at: new Date().toISOString() }))
  );

  localStorage.setItem(`${BACKUP_PREFIX}${name}`, JSON.stringify({
    version: 2,
    algorithm: 'AES-GCM-256',
    key_storage: 'indexeddb-nonextractable',
    iv: bytesToBase64(iv),
    data: bytesToBase64(encrypted),
  }));

  return true;
}

export async function loadEncryptedLocalBackup(name, scope = 'default') {
  if (!crypto?.subtle || typeof indexedDB === 'undefined') return null;

  const raw = localStorage.getItem(`${BACKUP_PREFIX}${name}`);
  if (!raw) return null;

  const stored = JSON.parse(raw);
  const key = await getBackupKey(scope);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(stored.iv) },
    key,
    base64ToBytes(stored.data)
  );

  const decoded = JSON.parse(new TextDecoder().decode(decrypted));
  return decoded.payload || null;
}

export function removeEncryptedLocalBackup(name) {
  localStorage.removeItem(`${BACKUP_PREFIX}${name}`);
}

export function hasEncryptedLocalBackup(name) {
  return Boolean(localStorage.getItem(`${BACKUP_PREFIX}${name}`));
}
