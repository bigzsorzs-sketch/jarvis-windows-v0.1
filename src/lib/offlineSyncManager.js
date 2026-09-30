import { jarvis } from '@/api/jarvisClient';
import { logger } from '@/lib/logger';
import { networkMonitor } from '@/lib/networkMonitor';
import { listSyncActions, mutateSyncActionIfUnchanged } from '@/lib/indexedDbOfflineStore';
import { MAX_SYNC_RETRIES, getRetryDelayMs, isReadyForRetry } from '@/lib/offlineSyncRules';

let syncing = false;

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
      content: String(message.content),
      timestamp: message.timestamp || new Date(snapshot.updatedAt || Date.now()).toISOString(),
    }));

  // Don't save an empty greeting as a separate history entry.
  if (!messages.some((message) => message.role === 'user')) return null;

  const offlineSyncId = String(snapshot?.metadata?.offlineChatId || item.id || '').slice(0,128);
  if (!offlineSyncId) return null;
  const firstUserText = messages.find((message) => message.role === 'user')?.content
    .replace(/\s+/g,' ').trim() || '';
  const title = firstUserText ? ('Offline: ' + firstUserText.slice(0,60)) : 'Offline beszélgetés';
  // An offline snapshot may be older than an already persisted local chat.
  // Resolve an explicitly linked SQLite ID first, never by the display title.
  const linkedId = String(snapshot?.metadata?.conversationId || '').trim();
  let existing = linkedId
    ? await jarvis.entities.Conversation.get(linkedId)
    : null;
  if (existing && existing.source !== 'chat') {
    throw new Error('OFFLINE_SYNC_TARGET_INVALID');
  }
  if (!existing) {
    const matching = await jarvis.entities.Conversation.filter(
      { source:'chat', offline_sync_id:offlineSyncId }, '-updated_date', 1
    );
    existing = matching?.[0] || null;
  }
  const patch = {
    title,
    messages,
    source:'chat',
    offline_sync_id:offlineSyncId,
    is_archived:false,
    metadata:{ ...snapshot.metadata, recoveredFromOffline:true }
  };
  if (existing) {
    const current = Array.isArray(existing.messages) ? existing.messages : [];
    const samePrefix = (shorter, longer) => shorter.every((message, i) => (
      message?.role === longer[i]?.role
      && String(message?.content ?? '') === String(longer[i]?.content ?? '')
    ));
    // An older snapshot must not replace later replies or action results.
    if (messages.length <= current.length && samePrefix(messages,current)) return existing;
    if (current.length <= messages.length && samePrefix(current,messages)) {
      return jarvis.entities.Conversation.update(existing.id,{
        offline_sync_id:offlineSyncId,
        messages:[...current,...messages.slice(current.length)],
        metadata:{...(existing.metadata || {}),...snapshot.metadata,recoveredFromOffline:true}
      });
    }
    // Divergent content is preserved in the queue (retry then manual recovery),
    // not overwritten or silently discarded.
    throw new Error('OFFLINE_SYNC_CONVERSATION_CONFLICT');
  }
  return jarvis.entities.Conversation.create({
    ...patch,
    created_by:user.email,
  });
}

export async function syncOfflineData() {
  if (syncing || !networkMonitor.isOnline()) return { synced: 0, failed: 0 };
  syncing = true;

  let synced = 0;
  let failed = 0;
  let rescanNeeded = false;

  try {
    const user = await jarvis.auth.me().catch(() => null);
    if (!user?.email) return { synced, failed };

    const now = Date.now();
    const items = (await listSyncActions())
      .filter((item) => isReadyForRetry(item, now))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    for (const item of items) {
      const claimed = await mutateSyncActionIfUnchanged(item, { status:'syncing' });
      if (!claimed) {
        rescanNeeded = true;
        continue;
      }
      try {
        if (item.type === 'conversation_snapshot') {
          await syncConversationSnapshot(item, user);
        } else if (item.type?.startsWith('route_')) {
          // Route sync has its own authoritative local queue. Drop legacy
          // IndexedDB route entries so upgrades cannot replay the same action.
          if (!await mutateSyncActionIfUnchanged(item)) rescanNeeded = true;
          continue;
        }
        const removed = await mutateSyncActionIfUnchanged(item);
        if (removed) synced += 1;
        else rescanNeeded = true;
      } catch (error) {
        failed += 1;
        const retryCount = (item.retry_count || 0) + 1;
        if (retryCount >= MAX_SYNC_RETRIES) {
          // Keep the user's unsynced payload for inspection or a manual retry.
          // Never equate repeated network failures with permission to delete data.
          logger.warn('OfflineSyncManager', 'Preserving sync item after retry limit', {
            id: item.id,
            type: item.type,
            error: error?.message || 'sync_failed',
          });
          if (!await mutateSyncActionIfUnchanged(item, {
            status: 'failed',
            retry_count: retryCount,
            next_retry_at: null,
            requires_manual_retry: true,
            last_error: error?.message || 'sync_failed',
          })) rescanNeeded = true;
          continue;
        }

        if (!await mutateSyncActionIfUnchanged(item, {
          status: 'failed',
          retry_count: retryCount,
          next_retry_at: Date.now() + getRetryDelayMs(retryCount),
          last_error: error?.message || 'sync_failed',
        })) rescanNeeded = true;
      }
    }
  } catch (error) {
    logger.warn('OfflineSyncManager', 'Sync failed', { message: error?.message });
  } finally {
    syncing = false;
    // A superseding snapshot remains pending. Scan it after releasing the lock
    // rather than waiting for the next network event.
    if (rescanNeeded && networkMonitor.isOnline()) {
      queueMicrotask(() => { void syncOfflineData(); });
    }
  }

  return { synced, failed };
}

export function startOfflineAutoSync() {
  const unsubscribe = networkMonitor.subscribe((online) => {
    if (online) syncOfflineData();
  });
  if (networkMonitor.isOnline()) syncOfflineData();
  // Retry while the connection stays online, including items added after startup.
  const timer = setInterval(() => { void syncOfflineData(); }, 30_000);
  return () => { clearInterval(timer); unsubscribe(); };
}