export default function OfflineSyncStatus({ queueCount, syncing, conflicts, onRetry }) {
  if (!queueCount && !conflicts.length) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Offline Sync</p>
          <p className="text-xs text-muted-foreground">
            {syncing ? 'Szinkronizálás folyamatban…' : `${queueCount} várakozó művelet`}
          </p>
        </div>
        <button onClick={onRetry} className="px-3 py-1.5 rounded-xl bg-primary/15 text-primary text-xs font-semibold">
          Retry
        </button>
      </div>
      {conflicts.length > 0 && (
        <div className="text-xs text-yellow-400">
          {conflicts.length} konfliktus kézi ellenőrzést igényel.
        </div>
      )}
    </div>
  );
}