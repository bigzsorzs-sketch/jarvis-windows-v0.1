import { jarvis } from '@/api/jarvisClient';
import { CONFIG } from '@/lib/appConfig';
import { networkMonitor } from '@/lib/networkMonitor';
import { getOfflineQueue, enqueueOfflineAction, updateOfflineAction, removeOfflineAction } from '@/lib/offlineActionQueue';
import { enqueueSyncAction, saveRouteSnapshot } from '@/lib/indexedDbOfflineStore';
import { setRouteTrackingState } from '@/lib/routeTrackingStore';

const ROUTE_QUEUE_PREFIX = 'route_';

function getRouteItems() {
  return getOfflineQueue().filter((item) => item.type?.startsWith(ROUTE_QUEUE_PREFIX));
}

function mapStats() {
  const items = getRouteItems();
  setRouteTrackingState({
    queueStats: {
      pending: items.filter((item) => item.status === 'pending' || !item.status).length,
      failed: items.filter((item) => item.status === 'failed').length,
    }
  });
}

export function enqueueRouteAction(type, payload) {
  const entry = enqueueOfflineAction({
    type,
    local_id: payload.local_id,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
    status: 'pending',
  });
  saveRouteSnapshot(payload);
  enqueueSyncAction({ type, id: `route_${entry.id}`, payload: { ...payload, local_id: payload.local_id } });
  mapStats();
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
  if (!networkMonitor.isOnline()) return;
  const items = getRouteItems();
  if (items.length === 0) {
    mapStats();
    return;
  }

  setRouteTrackingState({ syncStatus: 'syncing' });

  for (const item of items) {
    if ((item.retry_count || 0) >= CONFIG.ROUTE_QUEUE_MAX_RETRIES) continue;

    updateOfflineAction(item.id, (current) => ({ ...current, status: 'syncing' }));
    try {
      await syncRouteItem(item);
      removeOfflineAction(item.id);
    } catch {
      updateOfflineAction(item.id, (current) => ({
        ...current,
        retry_count: (current.retry_count || 0) + 1,
        status: (current.retry_count || 0) + 1 >= CONFIG.ROUTE_QUEUE_MAX_RETRIES ? 'failed' : 'pending',
      }));
      await new Promise((resolve) => setTimeout(resolve, CONFIG.ROUTE_QUEUE_BACKOFF_MS * (2 ** Math.min(item.retry_count || 0, 4))));
    }
  }

  mapStats();
  setRouteTrackingState({ syncStatus: 'idle' });
}

export function retryFailedRouteSync() {
  getRouteItems()
    .filter((item) => item.status === 'failed')
    .forEach((item) => {
      updateOfflineAction(item.id, (current) => ({ ...current, retry_count: 0, status: 'pending' }));
    });
  mapStats();
  return syncRouteQueue();
}

mapStats();