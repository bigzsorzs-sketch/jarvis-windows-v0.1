const STORAGE_KEY = 'offline_action_queue_v1';
const MAX_QUEUE_ITEMS = 100;

function loadQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_QUEUE_ITEMS) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_ITEMS)));
}

export function getOfflineQueue() {
  return loadQueue();
}

export function enqueueOfflineAction(action) {
  const queue = loadQueue();
  const entry = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    retries: 0,
    strategy: action.strategy || 'last_write_wins',
    ...action,
  };
  queue.push(entry);
  saveQueue(queue);
  return entry;
}

export function removeOfflineAction(id) {
  saveQueue(loadQueue().filter((item) => item.id !== id));
}

export function updateOfflineAction(id, updater) {
  const next = loadQueue().map((item) => item.id === id ? updater(item) : item);
  saveQueue(next);
}

export function clearOfflineQueue() {
  localStorage.removeItem(STORAGE_KEY);
}