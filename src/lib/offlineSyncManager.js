import { jarvis } from '@/api/jarvisClient';
import { logger } from '@/lib/logger';
import { networkMonitor } from '@/lib/networkMonitor';
import { listSyncActions, removeSyncAction, updateSyncAction } from '@/lib/indexedDbOfflineStore';

let syncing = false;

const MAX_SYNC_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 30 * 60 * 1000;

function getRetryDelayMs(retryCount) {
  return Math.min(BASE_RETRY_DELAY_MS * (2 ** Math.max(0, retryCount - 1)), MAX_RETRY_DELAY_MS);
}

function isReadyForRetry(item, now) {
  if (item.status === 'pending') return true;
  if (item.status !== 'failed') return false;
  if ((item.retry_count || 0) >= MAX_SYNC_RETRIES) return false;
  return !item.next_retry_at || item.next_retry_at <= now;
}

async function syncRouteAction(item, user) {
  const payload = item.payload || {};
  const localId = payload.local_id;
  if (!localId) return null;

  if (item.type === 'route_start') {
    const existing = await jarvis.entities.RouteHistory.filter({ created_by: user.email, local_id: localId }, '-created_date', 1);
    if (existing?.[0]) return existing[0];
    return jarvis.entities.RouteHistory.create({ ...payload, local_id: localId });
  }

  const existing = await jarvis.entities.RouteHistory.filter({ created_by: user.email, local_id: localId }, '-created_date', 1);
  const route = existing?.[0];
  if (!route) return null;

  if (item.type === 'route_update') {
    return jarvis.entities.RouteHistory.update(route.id, {
      notes: payload.notes || route.notes || '',
    });
  }

  if (item.type === 'route_end') {
    return jarvis.entities.RouteHistory.update(route.id, {
      end_lat: payload.end_lat,
      end_lng: payload.end_lng,
      end_time: payload.end_time,
      distance_km: payload.distance_km,
      duration_min: payload.duration_min,
      notes: payload.notes || route.notes || '',
    });
  }

  return null;
}

async function syncConversationSnapshot(item, user) {
  const snapshot = item.payload;
  const messages = (snapshot?.messages || [])
    .filter((message) => message?.role && message?.content)
    .map((message) => ({
      role: message.role,
      content: String(message.content).slice(0, 4000),
      timestamp: message.timestamp || new Date(snapshot.updatedAt || Date.now()).toISOString(),
    }));

  if (messages.length === 0) return null;

  const title = snapshot?.title || `Mobil beszélgetés ${new Date().toLocaleDateString('hu-HU')}`;
  const existing = await jarvis.entities.Conversation.filter({ title }, '-updated_date', 1);

  if (existing?.[0]) {
    return jarvis.entities.Conversation.update(existing[0].id, {
      title,
      messages,
      is_archived: false,
    });
  }

  return jarvis.entities.Conversation.create({
    title,
    messages,
    is_archived: false,
    created_by: user.email,
  });
}

export async function syncOfflineData() {
  if (syncing || !networkMonitor.isOnline()) return { synced: 0, failed: 0 };
  syncing = true;

  let synced = 0;
  let failed = 0;

  try {
    const user = await jarvis.auth.me().catch(() => null);
    if (!user?.email) return { synced, failed };

    const now = Date.now();
    const items = (await listSyncActions())
      .filter((item) => isReadyForRetry(item, now))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    for (const item of items) {
      await updateSyncAction(item.id, { status: 'syncing' });
      try {
        if (item.type === 'conversation_snapshot') {
          await syncConversationSnapshot(item, user);
        } else if (item.type?.startsWith('route_')) {
          await syncRouteAction(item, user);
        }
        await removeSyncAction(item.id);
        synced += 1;
      } catch (error) {
        failed += 1;
        const retryCount = (item.retry_count || 0) + 1;
        if (retryCount >= MAX_SYNC_RETRIES) {
          logger.warn('OfflineSyncManager', 'Dropping permanently failed sync item', {
            id: item.id,
            type: item.type,
            error: error?.message || 'sync_failed',
          });
          await removeSyncAction(item.id);
          continue;
        }

        await updateSyncAction(item.id, {
          status: 'failed',
          retry_count: retryCount,
          next_retry_at: Date.now() + getRetryDelayMs(retryCount),
          last_error: error?.message || 'sync_failed',
        });
      }
    }
  } catch (error) {
    logger.warn('OfflineSyncManager', 'Sync failed', { message: error?.message });
  } finally {
    syncing = false;
  }

  return { synced, failed };
}

export function startOfflineAutoSync() {
  const unsubscribe = networkMonitor.subscribe((online) => {
    if (online) syncOfflineData();
  });
  if (networkMonitor.isOnline()) syncOfflineData();
  return unsubscribe;
}