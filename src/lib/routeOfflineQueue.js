import { jarvis } from '@/api/jarvisClient';
import { CONFIG } from '@/lib/appConfig';
import { networkMonitor } from '@/lib/networkMonitor';
import { getOfflineQueue, enqueueOfflineAction, updateOfflineAction, removeOfflineAction } from '@/lib/offlineActionQueue';
import { saveRouteSnapshot } from '@/lib/indexedDbOfflineStore';
import { setRouteTrackingState } from '@/lib/routeTrackingStore';

const ROUTE_QUEUE_PREFIX = 'route_';
let routeSyncing = false;
let routeRetryTimer = null;
let routeRetryDueAt = 0;

function getRouteItems() {
  return getOfflineQueue().filter((item) => item.type?.startsWith(ROUTE_QUEUE_PREFIX));
}

function mapStats() {
  const items = getRouteItems();
  setRouteTrackingState({
    queueStats: {
      pending: items.filter((item) => item.status === 'pending' || item.status === 'syncing' || !item.status).length,
      failed: items.filter((item) => item.status === 'failed').length,
    }
  });
}

function clearRouteRetryTimer() {
  if (routeRetryTimer !== null) clearTimeout(routeRetryTimer);
  routeRetryTimer = null;
  routeRetryDueAt = 0;
}

function retryDelayMs(retryCount) {
  const exponent = Math.min(Math.max(Number(retryCount || 1) - 1, 0), 4);
  return CONFIG.ROUTE_QUEUE_BACKOFF_MS * (2 ** exponent);
}

function getRouteHeads(items) {
  const seen = new Set();
  return items.filter((item) => {
    const routeKey = item.local_id || item.payload?.local_id || item.id;
    if (seen.has(routeKey)) return false;
    seen.add(routeKey);
    return true;
  });
}

function scheduleRouteRetry(delayOverride = null) {
  if (!networkMonitor.isOnline()) {
    clearRouteRetryTimer();
    return;
  }

  const now = Date.now();
  const candidates = getRouteHeads(getRouteItems()).filter((item) =>
    item.status !== 'failed' && (item.retry_count || 0) < CONFIG.ROUTE_QUEUE_MAX_RETRIES
  );
  if (candidates.length === 0) {
    clearRouteRetryTimer();
    return;
  }

  const earliestRetryAt = Math.min(...candidates.map((item) => Number(item.next_retry_at || 0)));
  const delay = delayOverride === null
    ? Math.max(0, earliestRetryAt - now)
    : Math.max(0, Number(delayOverride) || 0);
  const dueAt = now + delay;

  if (routeRetryTimer !== null && routeRetryDueAt <= dueAt) return;
  clearRouteRetryTimer();
  routeRetryDueAt = dueAt;
  routeRetryTimer = setTimeout(() => {
    routeRetryTimer = null;
    routeRetryDueAt = 0;
    void syncRouteQueue();
  }, delay);
}

function recoverInterruptedRouteItems() {
  for (const item of getRouteItems()) {
    if (item.status === 'syncing') {
      updateOfflineAction(item.id, (current) => ({ ...current, status:'pending' }));
    } else if ((item.retry_count || 0) >= CONFIG.ROUTE_QUEUE_MAX_RETRIES && item.status !== 'failed') {
      updateOfflineAction(item.id, (current) => ({ ...current, status:'failed', next_retry_at:null }));
    }
  }
}

export function enqueueRouteAction(type, payload) {
  const entry = enqueueOfflineAction({
    type,
    local_id: payload.local_id,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
    status: 'pending',
    next_retry_at: null,
  });
  saveRouteSnapshot(payload);
  // Route actions use this queue as their single source of truth. Conversation
  // sync still uses IndexedDB, but route actions must not be enqueued twice.
  mapStats();
  if (networkMonitor.isOnline()) scheduleRouteRetry(0);
  return entry;
}

async function syncRouteItem(item) {
  const currentUser = await jarvis.auth.me().catch(() => null);
  if (!currentUser?.email) throw new Error('AUTH_REQUIRED');

  if (item.type === 'route_start') {
    const existing = await jarvis.entities.RouteHistory.filter({ created_by: currentUser.email, local_id: item.local_id }, '-created_date', 1);
    if (existing.length > 0) return existing[0];
    return await jarvis.entities.RouteHistory.create({
      ...item.payload,
      local_id: item.local_id,
      created_by: currentUser.email,
    });
  }

  const existing = await jarvis.entities.RouteHistory.filter({ created_by: currentUser.email, local_id: item.local_id }, '-created_date', 1);
  const route = existing[0];
  if (!route) throw new Error('MISSING_REMOTE_ROUTE');

  if (item.type === 'route_update') {
    return await jarvis.entities.RouteHistory.update(route.id, {
      notes: item.payload.notes || route.notes || '',
    });
  }

  if (item.type === 'route_end') {
    return await jarvis.entities.RouteHistory.update(route.id, {
      end_lat: item.payload.end_lat,
      end_lng: item.payload.end_lng,
      end_time: item.payload.end_time,
      distance_km: item.payload.distance_km,
      duration_min: item.payload.duration_min,
      notes: item.payload.notes || route.notes || '',
    });
  }

  return null;
}

export async function syncRouteQueue() {
  if (!networkMonitor.isOnline() || routeSyncing) return;
  routeSyncing = true;
  clearRouteRetryTimer();
  setRouteTrackingState({ syncStatus: 'syncing' });

  try {
    while (networkMonitor.isOnline()) {
      const heads = getRouteHeads(getRouteItems());
      if (heads.length === 0) break;

      const now = Date.now();
      const ready = heads.filter((item) =>
        item.status !== 'failed'
        && (item.retry_count || 0) < CONFIG.ROUTE_QUEUE_MAX_RETRIES
        && Number(item.next_retry_at || 0) <= now
      );
      if (ready.length === 0) break;

      let removedAny = false;
      for (const item of ready) {
        if (!networkMonitor.isOnline()) break;

        updateOfflineAction(item.id, (current) => ({ ...current, status:'syncing' }));
        try {
          await syncRouteItem(item);
          removeOfflineAction(item.id);
          removedAny = true;
        } catch {
          if (!networkMonitor.isOnline()) {
            updateOfflineAction(item.id, (current) => ({
              ...current,
              status:'pending',
              next_retry_at:null,
            }));
            break;
          }

          updateOfflineAction(item.id, (current) => {
            const retryCount = (current.retry_count || 0) + 1;
            const exhausted = retryCount >= CONFIG.ROUTE_QUEUE_MAX_RETRIES;
            return {
              ...current,
              retry_count:retryCount,
              status:exhausted ? 'failed' : 'pending',
              next_retry_at:exhausted ? null : Date.now() + retryDelayMs(retryCount),
            };
          });
        }
      }

      // Failed route heads remain at the front of their own route and block
      // route_update/route_end until the dependency succeeds or is manually reset.
      if (!removedAny) break;
    }
  } finally {
    routeSyncing = false;
    mapStats();
    setRouteTrackingState({ syncStatus: 'idle' });
    scheduleRouteRetry();
  }
}

export function restoreRouteQueueSync() {
  recoverInterruptedRouteItems();
  mapStats();
  if (networkMonitor.isOnline()) scheduleRouteRetry(0);
}

export function wakeRouteQueueSync() {
  if (networkMonitor.isOnline()) scheduleRouteRetry(0);
}

export function pauseRouteQueueSync() {
  clearRouteRetryTimer();
}

export function retryFailedRouteSync() {
  getRouteItems()
    .filter((item) => item.status === 'failed')
    .forEach((item) => {
      updateOfflineAction(item.id, (current) => ({ ...current, retry_count:0, status:'pending', next_retry_at:null }));
    });
  mapStats();
  if (networkMonitor.isOnline()) scheduleRouteRetry(0);
  return syncRouteQueue();
}

mapStats();
