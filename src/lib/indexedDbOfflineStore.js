import { logger } from '@/lib/logger';

const DB_NAME = 'jarvis_mobile_offline_v1';
const DB_VERSION = 1;
const STORES = {
  kv: 'kv',
  syncQueue: 'syncQueue',
  routes: 'routes',
  conversations: 'conversations',
};

let dbPromise = null;

function hasIndexedDb() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openOfflineDb() {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.kv)) db.createObjectStore(STORES.kv, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORES.routes)) db.createObjectStore(STORES.routes, { keyPath: 'local_id' });
      if (!db.objectStoreNames.contains(STORES.conversations)) db.createObjectStore(STORES.conversations, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.syncQueue)) {
        const queue = db.createObjectStore(STORES.syncQueue, { keyPath: 'id' });
        queue.createIndex('status', 'status', { unique: false });
        queue.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    logger.warn('IndexedDbOfflineStore', 'Open failed', { message: error?.message });
    return null;
  });

  return dbPromise;
}

async function runStore(storeName, mode, handler) {
  const db = await openOfflineDb();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = handler(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    logger.warn('IndexedDbOfflineStore', `${storeName} operation failed`, { message: error?.message });
    return null;
  });
}

export async function putLocalValue(key, value) {
  return runStore(STORES.kv, 'readwrite', (store) => store.put({ key, value, updatedAt: Date.now() }));
}

export async function getLocalValue(key, fallback = null) {
  const record = await runStore(STORES.kv, 'readonly', (store) => store.get(key));
  return record?.value ?? fallback;
}

export async function saveRouteSnapshot(route) {
  if (!route?.local_id) return null;
  return runStore(STORES.routes, 'readwrite', (store) => store.put({ ...route, updatedAt: Date.now() }));
}

function compactOfflineSnapshotMessages(messages) {
  return (Array.isArray(messages) ? messages : []).slice(-200).map((message) => {
    if (!message || typeof message !== 'object') return message;
    const { attachedFiles, ...textAndState } = message;
    if (!Array.isArray(attachedFiles) || attachedFiles.length === 0) return textAndState;
    return {
      ...textAndState,
      // Keep attachment identity, not megabytes of raw data URLs in IndexedDB
      // snapshots or queued sync actions. Files must be re-attached to re-use.
      attachedFiles: attachedFiles.slice(0,20).map((file) => ({
        name:String(file?.name || 'Csatolmány').slice(0,120),
        kind:String(file?.kind || 'document').slice(0,30),
        type:String(file?.type || '').slice(0,120),
        size:Number.isFinite(file?.size) ? Math.max(0,Math.floor(file.size)) : null,
        metadataOnly:true
      }))
    };
  });
}

export async function saveChatSnapshot(messages, metadata = {}) {
  const snapshot = {
    id: 'active_chat',
    title: metadata.title || 'Mobil beszélgetés',
    messages: compactOfflineSnapshotMessages(messages),
    metadata,
    updatedAt: Date.now(),
    syncedAt: metadata.syncedAt || null,
  };
  await runStore(STORES.conversations, 'readwrite', (store) => store.put(snapshot));
  await putLocalValue('last_chat_snapshot_id', snapshot.id);
  return snapshot;
}

export async function loadChatSnapshot() {
  return runStore(STORES.conversations, 'readonly', (store) => store.get('active_chat'));
}

export async function enqueueSyncAction(action) {
  const entry = {
    id: action.id || crypto.randomUUID(),
    revision: crypto.randomUUID(),
    type: action.type,
    payload: action.payload || {},
    status: 'pending',
    retry_count: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await runStore(STORES.syncQueue, 'readwrite', (store) => store.put(entry));
  return entry;
}

export async function queueConversationSync(messages, metadata = {}) {
  const snapshot = await saveChatSnapshot(messages, metadata);
  // Coalesce only snapshots from the SAME conversation. A global active_chat
  // queue key used to overwrite unrelated offline conversations.
  const sessionId = String(metadata.offlineChatId || '').trim();
  const queueId = sessionId
    ? 'conversation_snapshot_' + sessionId
    : 'conversation_snapshot_legacy_active';
  return enqueueSyncAction({
    type: 'conversation_snapshot',
    id: queueId,
    payload: snapshot,
  });
}

export async function listSyncActions() {
  return (await runStore(STORES.syncQueue, 'readonly', (store) => store.getAll())) || [];
}

// Compare-and-swap within ONE IndexedDB transaction. Never mark a newer
// payload as failed or remove it when an older worker finishes.
export async function mutateSyncActionIfUnchanged(item, updates = null) {
  if (!item?.id) return false;
  const db = await openOfflineDb();
  // A storage failure is NOT a superseded queue revision. Propagate the
  // error so the sync worker stops instead of rescheduling itself forever.
  if (!db) throw new Error('OFFLINE_QUEUE_UNAVAILABLE');
  return new Promise((resolve, reject) => {
    let mutated = false;
    const tx = db.transaction(STORES.syncQueue, 'readwrite');
    const store = tx.objectStore(STORES.syncQueue);
    tx.oncomplete = () => resolve(mutated);
    tx.onerror = () => reject(tx.error || new Error('OFFLINE_QUEUE_TRANSACTION_FAILED'));
    tx.onabort = () => reject(tx.error || new Error('OFFLINE_QUEUE_TRANSACTION_ABORTED'));
    const request = store.get(item.id);
    request.onsuccess = () => {
      const current = request.result;
      if (!current) return;
      const sameRevision = item.revision
        ? current.revision === item.revision
        : !current.revision
          && current.createdAt === item.createdAt
          && current.payload?.updatedAt === item.payload?.updatedAt
          && JSON.stringify(current.payload) === JSON.stringify(item.payload);
      if (!sameRevision) return;
      if (updates === null) store.delete(item.id);
      else store.put({ ...current, ...updates, updatedAt:Date.now() });
      mutated = true;
    };
  }).catch((error) => {
    logger.warn('IndexedDbOfflineStore', 'Atomic queue mutation failed', {
      message:error?.message || String(error),
    });
    throw error;
  });
}

export async function updateSyncAction(id, updates) {
  const current = await runStore(STORES.syncQueue, 'readonly', (store) => store.get(id));
  if (!current) return null;
  return runStore(STORES.syncQueue, 'readwrite', (store) => store.put({ ...current, ...updates, updatedAt: Date.now() }));
}

export async function removeSyncAction(id) {
  return runStore(STORES.syncQueue, 'readwrite', (store) => store.delete(id));
}

export async function getOfflineStorageStats() {
  const [conversation, queue] = await Promise.all([loadChatSnapshot(), listSyncActions()]);
  return {
    indexedDbAvailable: hasIndexedDb(),
    storedMessages: conversation?.messages?.length || 0,
    pendingSync: queue.filter((item) => item.status === 'pending' || item.status === 'failed').length,
    lastSavedAt: conversation?.updatedAt || null,
  };
}