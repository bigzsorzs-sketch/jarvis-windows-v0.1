import { useCallback, useEffect, useState } from 'react';
import { jarvis } from '@/api/jarvisClient';
import networkMonitor from '@/lib/networkMonitor';
import { getOfflineQueue, removeOfflineAction, updateOfflineAction } from '@/lib/offlineActionQueue';
import { buildConflictRecord, shouldArchiveConflict } from '@/lib/offlineConflictResolver';

const MAX_RETRIES = 3;

export default function useOfflineSync() {
  const [queue, setQueue] = useState(() => getOfflineQueue());
  const [syncing, setSyncing] = useState(false);
  const [conflicts, setConflicts] = useState([]);

  const refresh = useCallback(() => {
    setQueue(getOfflineQueue());
  }, []);

  const syncQueue = useCallback(async () => {
    if (!networkMonitor.isOnline()) return;
    const items = getOfflineQueue();
    if (!items.length) return;

    setSyncing(true);
    const nextConflicts = [];

    for (const item of items) {
      try {
        const entityApi = jarvis.entities[item.entityName];
        if (!entityApi) throw new Error('Missing entity api');

        if (item.operation === 'create') {
          await entityApi.create(item.payload);
        } else if (item.operation === 'update') {
          await entityApi.update(item.recordId, item.payload);
        } else if (item.operation === 'delete') {
          await entityApi.delete(item.recordId);
        }

        removeOfflineAction(item.id);
      } catch (error) {
        const retries = (item.retries || 0) + 1;
        if (shouldArchiveConflict(retries, MAX_RETRIES)) {
          nextConflicts.push(buildConflictRecord(item, error?.message || 'Sync failed'));
        }
        updateOfflineAction(item.id, (current) => ({ ...current, retries, lastError: error?.message || 'Sync failed' }));
      }
    }

    setConflicts(nextConflicts);
    refresh();
    setSyncing(false);
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = networkMonitor.subscribe((online) => {
      if (online) syncQueue();
    });
    return unsubscribe;
  }, [syncQueue]);

  return { queue, syncing, conflicts, syncQueue, refresh };
}