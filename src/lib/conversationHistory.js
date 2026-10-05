import { jarvis } from '@/api/jarvisClient';
import { getLocalValue, loadChatSnapshot, putLocalValue } from '@/lib/indexedDbOfflineStore';

const CHAT_SOURCE = 'chat';
const LEGACY_MIGRATION_KEY = 'chat_history_legacy_snapshot_migrated_v1';
const LEGACY_MIGRATION_ID = 'legacy_active_chat_v1';

function normalizeMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
    .slice(-200)
    .map((message) => ({
      role: message.role,
      content: String(message.content || ''),
      timestamp: message.timestamp || new Date().toISOString(),
      ...(Array.isArray(message.actionResults) && message.actionResults.length
        ? { actionResults: message.actionResults.slice(0, 20) }
        : {}),
      // Keep the evidence that an attachment existed, not its potentially
      // multi-megabyte Base64 data URL in every SQLite conversation snapshot.
      ...(Array.isArray(message.attachedFiles) && message.attachedFiles.length
        ? { attachedFiles: message.attachedFiles.slice(0, 20).map((file) => ({
          name:String(file?.name || 'Csatolmány').slice(0, 120),
          kind:String(file?.kind || 'document').slice(0, 30),
          type:String(file?.type || '').slice(0, 120),
          size:Number.isFinite(file?.size) ? Math.max(0,Math.floor(file.size)) : null,
          metadataOnly:true,
        })) }
        : {}),
    }));
}

export function conversationTitle(messages = []) {
  const firstUser = (Array.isArray(messages) ? messages : []).find(
    (message) => message?.role === 'user' && String(message?.content || '').trim()
  );
  const raw = String(firstUser?.content || 'Új beszélgetés')
    .replace(/\s+/g, ' ')
    .trim();
  if (raw.length <= 58) return raw;
  return raw.slice(0, 55).trimEnd() + '…';
}

export async function listConversationHistory(limit = 60) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 60));
  return jarvis.entities.Conversation
    .filter({ source: CHAT_SOURCE }, '-updated_date', safeLimit)
    .catch(() => []);
}

export async function getConversationHistory(conversationId) {
  if (!conversationId) return null;
  return jarvis.entities.Conversation.get(conversationId).catch(() => null);
}

export async function saveConversationHistory(conversationId, messages, metadata = {}) {
  const normalized = normalizeMessages(messages);
  if (!normalized.some((message) => message.role === 'user')) return conversationId || null;

  const patch = {
    title: conversationTitle(normalized),
    source: CHAT_SOURCE,
    ...(metadata.offlineChatId ? { offline_sync_id:String(metadata.offlineChatId) } : {}),
    messages: normalized,
    metadata: {
      ...(metadata || {}),
      lastSavedAt: new Date().toISOString(),
    },
  };

  if (conversationId) {
    const updated = await jarvis.entities.Conversation.update(conversationId, patch);
    return updated?.id || conversationId;
  }

  const created = await jarvis.entities.Conversation.create(patch);
  return created?.id || null;
}

export async function deleteConversationHistory(conversationId) {
  if (!conversationId) return { success:false };
  return jarvis.entities.Conversation.delete(conversationId);
}

export async function migrateLegacyChatSnapshotOnce() {
  const alreadyMigrated = await getLocalValue(LEGACY_MIGRATION_KEY, false);
  if (alreadyMigrated) return null;

  const existing = await jarvis.entities.Conversation
    .filter({ migration_id: LEGACY_MIGRATION_ID }, '-updated_date', 1)
    .catch(() => []);
  if (existing?.length) {
    await putLocalValue(LEGACY_MIGRATION_KEY, true);
    return existing[0];
  }

  const snapshot = await loadChatSnapshot().catch(() => null);
  const normalized = normalizeMessages(snapshot?.messages || []);
  if (!normalized.some((message) => message.role === 'user')) {
    await putLocalValue(LEGACY_MIGRATION_KEY, true);
    return null;
  }

  const created = await jarvis.entities.Conversation.create({
    title: conversationTitle(normalized),
    source: CHAT_SOURCE,
    migration_id: LEGACY_MIGRATION_ID,
    messages: normalized,
    metadata: {
      migratedFrom: 'indexeddb_active_chat',
      migratedAt: new Date().toISOString(),
    },
  });

  await putLocalValue(LEGACY_MIGRATION_KEY, true);
  return created;
}
