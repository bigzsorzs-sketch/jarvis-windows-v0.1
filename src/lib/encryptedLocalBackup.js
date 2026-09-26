const BACKUP_PREFIX = 'jarvis_secure_backup:';
const DEVICE_SECRET_KEY = 'jarvis_secure_backup_device_secret';

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function getDeviceSecret() {
  const existing = localStorage.getItem(DEVICE_SECRET_KEY);
  if (existing) return existing;

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = bytesToBase64(bytes);
  localStorage.setItem(DEVICE_SECRET_KEY, secret);
  return secret;
}

async function getBackupKey(scope = 'default') {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getDeviceSecret()),
    'PBKDF2',
    false,
    ['deriveKey']
  );

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
  if (!crypto?.subtle || !payload) return false;

  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getBackupKey(scope);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify({ payload, saved_at: new Date().toISOString() }))
  );

  localStorage.setItem(`${BACKUP_PREFIX}${name}`, JSON.stringify({
    version: 1,
    algorithm: 'AES-GCM-256',
    iv: bytesToBase64(iv),
    data: bytesToBase64(encrypted),
  }));

  return true;
}

export async function loadEncryptedLocalBackup(name, scope = 'default') {
  if (!crypto?.subtle) return null;

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