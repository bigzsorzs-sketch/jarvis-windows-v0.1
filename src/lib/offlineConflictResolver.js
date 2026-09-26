export function buildConflictRecord(item, errorMessage = 'Sync failed') {
  return {
    id: item.id,
    entityName: item.entityName,
    operation: item.operation,
    recordId: item.recordId || null,
    strategy: item.strategy || 'last_write_wins',
    payload: item.payload || null,
    errorMessage,
    createdAt: item.createdAt,
    retries: item.retries || 0,
  };
}

export function shouldArchiveConflict(retries, maxRetries) {
  return retries >= maxRetries;
}