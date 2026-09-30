// Pure, runtime-independent retry rules. Keep these testable without Electron.
export const MAX_SYNC_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 30 * 60 * 1000;

export function getRetryDelayMs(retryCount) {
  return Math.min(BASE_RETRY_DELAY_MS * (2 ** Math.max(0, retryCount - 1)), MAX_RETRY_DELAY_MS);
}

export function isReadyForRetry(item, now) {
  if (!item || !item.type) return false;
  if (item.status === 'pending') return true;
  // Only one sync worker operates in a running process. A persisted 'syncing'
  // entry therefore means the previous process was interrupted; recover it.
  if (item.status === 'syncing') return true;
  if (item.status !== 'failed') return false;
  if ((item.retry_count || 0) >= MAX_SYNC_RETRIES) return false;
  return !item.next_retry_at || item.next_retry_at <= now;
}
