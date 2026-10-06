import { jarvis } from '@/api/jarvisClient';
import { getLocalValue, loadChatSnapshot, putLocalValue } from '@/lib/indexedDbOfflineStore';
import { normalizeConversationMessages } from '@/lib/conversationMessages';

const CHAT_SOURCE = 'chat';
const LEGACY_MIGRATION_KEY = 'chat_history_legacy_snapshot_migrated_v1';
const LEGACY_MIGRATION_ID = 'legacy_active_chat_v1';

function normalizeMessages(messages = []) {
  return normalizeConversationMessages(messages);
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
