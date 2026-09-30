// Each chat has its own save queue and its own persisted ID. A queued save
// must never look up the *currently displayed* conversation when it executes.
export function createConversationSaveSession(id = null) {
  return { id, pending:Promise.resolve() };
}

export function enqueueConversationSave(session, messages, metadata, save, onSaved, onError) {
  if (!session || typeof save !== 'function') throw new TypeError('CHAT_PERSISTENCE_INVALID');
  session.pending = session.pending
    .then(async () => {
      const conversationId = await save(session.id, messages, metadata);
      if (conversationId) {
        session.id = conversationId;
        onSaved?.(conversationId, session);
      }
      return conversationId;
    })
    .catch((error) => {
      onError?.(error, session);
      return null;
    });
  return session.pending;
}
