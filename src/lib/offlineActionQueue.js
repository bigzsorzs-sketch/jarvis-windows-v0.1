const STORAGE_KEY = 'offline_action_queue_v1';
const MAX_QUEUE_ITEMS = 100;
const ROUTE_START_RESERVE = 10;

function trimQueue(queue) {
  if (!Array.isArray(queue)) return [];
  if (queue.length <= MAX_QUEUE_ITEMS) return queue;

  const tailSize = Math.max(1, MAX_QUEUE_ITEMS - ROUTE_START_RESERVE);
  const tail = queue.slice(-tailSize);
  const activeRouteIds = new Set(
    tail
      .filter((item) => item?.type?.startsWith('route_') && item?.local_id)
      .map((item) => item.local_id)
  );
  const reservedStarts = queue
    .filter((item) => item?.type === 'route_start' && activeRouteIds.has(item.local_id))
    .slice(-ROUTE_START_RESERVE);
  const reservedIds = new Set(reservedStarts.map((item) => item.id));

  return [
    ...reservedStarts,
    ...tail.filter((item) => !reservedIds.has(item.id)),
  ].slice(-MAX_QUEUE_ITEMS);
}

function loadQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return trimQueue(parsed);
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimQueue(queue)));
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
