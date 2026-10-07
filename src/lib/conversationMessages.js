const messageIdentities = new WeakMap();
const conversationWrites = new Map();

// History saves and offline recovery share these locks. A read/merge/write
// must finish before another writer reads the same conversation in this app.
export function withConversationWrite(key, operation) {
  const previous = conversationWrites.get(key) || Promise.resolve();
  const work = previous.catch(() => {}).then(operation);
  const pending = work.finally(() => {
    if (conversationWrites.get(key) === pending) conversationWrites.delete(key);
  });
  conversationWrites.set(key, pending);
  return pending;
}

// A deletion marker contains only identity, never the removed message text.
// Offline snapshots can arrive after deletion, including snapshots captured
// before their first SQLite ID was assigned.
export async function hasConversationDeletion(api, conversationId, offlineId) {
  const identities = [
    conversationId && { deleted_conversation_id:String(conversationId) },
    offlineId && { offline_sync_id:String(offlineId) },
  ].filter(Boolean);
  for (const identity of identities) {
    const found = await api.filter({ source:'chat-deletion', ...identity }, '-created_date', 1);
    if (found?.length) return true;
  }
  return false;
}

// A UI message can be used by several concurrent save paths. Give the source
// object the same identity each time without mutating React state or file data.
export function ensureConversationMessageIdentity(message) {
  if (!message || typeof message !== 'object') return message;
  let identity = messageIdentities.get(message);
  if (!identity) {
    identity = {
      id: message.id || crypto.randomUUID(),
      timestamp: message.timestamp || new Date().toISOString(),
    };
    messageIdentities.set(message, identity);
  }
  if (message.id && message.timestamp) return message;
  const identified = { ...message, ...identity };
  messageIdentities.set(identified, identity);
  return identified;
}

// All persisted chat paths use this format. Legacy records keep their missing
// IDs so recovery can distinguish a proven identity from a text-only match.
export function normalizeConversationMessages(messages = [], fallbackTimestamp = new Date().toISOString()) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
    .slice(-200)
    .map((message) => ({
      ...(message.id ? { id: String(message.id).slice(0, 128) } : {}),
      role: message.role,
      content: String(message.content || ''),
      timestamp: message.timestamp || fallbackTimestamp,
      ...(Array.isArray(message.actionResults) && message.actionResults.length
        ? { actionResults: message.actionResults.slice(0, 20) }
        : {}),
      ...(Array.isArray(message.attachedFiles) && message.attachedFiles.length
        ? { attachedFiles: message.attachedFiles.slice(0, 20).map((file) => ({
          name: String(file?.name || 'Csatolmány').slice(0, 120),
          kind: String(file?.kind || 'document').slice(0, 30),
          type: String(file?.type || '').slice(0, 120),
          size: Number.isFinite(file?.size) ? Math.max(0, Math.floor(file.size)) : null,
          metadataOnly: true,
        })) }
        : {}),
    }));
}

function sameMessage(left, right) {
  return left.role === right.role && left.content === right.content
    && (!left.id || !right.id || left.id === right.id);
}

function mergeEvidence(current = [], incoming = []) {
  const result = current.slice(0, 20);
  const seen = new Set(result.map((entry) => JSON.stringify(entry)));
  for (const entry of incoming) {
    const key = JSON.stringify(entry);
    if (seen.has(key)) continue;
    if (result.length === 20) break;
    result.push(entry);
    seen.add(key);
  }
  return result;
}

function mergeMessage(current, incoming) {
  const merged = { ...incoming, ...current };
  for (const field of ['attachedFiles', 'actionResults']) {
    const evidence = mergeEvidence(current[field], incoming[field]);
    if (evidence.length) merged[field] = evidence;
  }
  return merged;
}

export function mergeConversationMessages(currentMessages, incomingMessages) {
  const current = normalizeConversationMessages(currentMessages);
  const incoming = normalizeConversationMessages(incomingMessages);
  if (!current.length) return incoming;
  if (!incoming.length) return current;
  const conflict = () => { throw new Error('OFFLINE_SYNC_CONVERSATION_CONFLICT'); };
  const indexIds = (messages) => {
    const ids = new Map();
    messages.forEach((message, index) => {
      if (!message.id) return;
      if (ids.has(message.id)) conflict();
      ids.set(message.id, index);
    });
    return ids;
  };
  const currentIds = indexIds(current);
  const incomingIds = indexIds(incoming);
  const sharedOffsets = new Set();
  for (const [id, incomingIndex] of incomingIds) {
    if (!currentIds.has(id)) continue;
    const currentIndex = currentIds.get(id);
    if (!sameMessage(current[currentIndex], incoming[incomingIndex])) conflict();
    sharedOffsets.add(currentIndex - incomingIndex);
  }
  if (sharedOffsets.size > 1) conflict();

  const alignments = [];
  for (let offset = 1 - incoming.length; offset < current.length; offset += 1) {
    if (sharedOffsets.size && !sharedOffsets.has(offset)) continue;
    const from = Math.max(0, offset);
    const to = Math.min(current.length, offset + incoming.length);
    let matches = true;
    let identified = false;
    const signatures = new Set();
    for (let i = from; i < to; i += 1) {
      const left = current[i];
      const right = incoming[i - offset];
      if (!sameMessage(left, right)) { matches = false; break; }
      if (left.id && left.id === right.id) identified = true;
      signatures.add(JSON.stringify([left.role, left.content]));
    }
    // A lone legacy boundary match or a repetitive legacy sequence is not
    // enough evidence to join rolling windows. A unique one-message prefix is
    // retained for old short chats; stable IDs support single-message overlap.
    const shortLegacy = Math.min(current.length, incoming.length) === 1 && offset === 0;
    if (matches && (identified || shortLegacy || (to - from >= 2 && signatures.size >= 2))) {
      alignments.push(offset);
    }
  }
  if (alignments.length !== 1) conflict();
  const offset = alignments[0];
  const merged = current.map((message, index) => {
    const other = incoming[index - offset];
    return other ? mergeMessage(message, other) : message;
  });
  // Older windows can enrich shared messages, but cannot remove newer replies
  // or prepend a guessed history. Only a proven continuation extends the tail.
  merged.push(...incoming.slice(Math.max(0, current.length - offset)));
  return merged.slice(-200);
}
