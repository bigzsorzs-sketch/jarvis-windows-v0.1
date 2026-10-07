import { jarvis } from '@/api/jarvisClient';
import { getLocalValue, loadChatSnapshot, putLocalValue, saveChatSnapshot, queueConversationSync } from '@/lib/indexedDbOfflineStore';
import { normalizeConversationMessages, mergeConversationMessages, withConversationWrite, hasConversationDeletion } from '@/lib/conversationMessages';

const CHAT_SOURCE = 'chat';
const LEGACY_MIGRATION_KEY = 'chat_history_legacy_snapshot_migrated_v1';
const LEGACY_MIGRATION_ID = 'legacy_active_chat_v1';
let legacyMigrationPromise = null;

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

  const offlineId = String(metadata.offlineChatId || '').trim();
  return withConversationWrite('session:' + (offlineId || conversationId || 'legacy-online'), async () => {
    if (await hasConversationDeletion(jarvis.entities.Conversation, conversationId, offlineId)) {
      throw new Error('CHAT_CONVERSATION_DELETED');
    }
    let id = conversationId;
    if (!id && offlineId) {
      const matching = await jarvis.entities.Conversation.filter(
        { source:CHAT_SOURCE, offline_sync_id:offlineId }, '-updated_date', 1
      );
      id = matching?.[0]?.id || null;
    }
    if (!id) {
      const created = await jarvis.entities.Conversation.create(patch);
      return created?.id || null;
    }
    return withConversationWrite('record:' + id, async () => {
      const current = await jarvis.entities.Conversation.get(id);
      if (!current) throw new Error('CHAT_CONVERSATION_NOT_FOUND');
      if (current.source !== CHAT_SOURCE) throw new Error('CHAT_CONVERSATION_TARGET_INVALID');
      const updated = await jarvis.entities.Conversation.update(id, {
        ...patch,
        ...(current.offline_sync_id ? { offline_sync_id:current.offline_sync_id } : {}),
        messages:mergeConversationMessages(current.messages, normalized),
        metadata:{ ...(current.metadata || {}), ...patch.metadata },
      });
      return updated?.id || id;
    });
  });
}

export async function deleteConversationHistory(conversationId) {
  if (!conversationId) return { success:false };
  const api = jarvis.entities.Conversation;
  const current = await api.get(conversationId);
  if (!current) return { success:false };
  if (current.source !== CHAT_SOURCE) throw new Error('CHAT_CONVERSATION_TARGET_INVALID');
  const offlineId = current.offline_sync_id || current.metadata?.offlineChatId || conversationId;
  return withConversationWrite('session:' + offlineId, () => withConversationWrite('record:' + conversationId, async () => {
    const latest = await api.get(conversationId);
    if (!latest) return { success:false };
    const existingMarker = await hasConversationDeletion(api, conversationId, offlineId);
    const marker = existingMarker ? null : await api.create({
      source:'chat-deletion', deleted_conversation_id:String(conversationId),
      offline_sync_id:String(offlineId), messages:[],
      metadata:{ deletedAt:new Date().toISOString() },
    });
    try {
      return await api.delete(conversationId);
    } catch (error) {
      if (marker?.id) {
        try { await api.delete(marker.id); }
        catch (rollbackError) {
          throw new Error('CHAT_DELETE_ROLLBACK_FAILED: ' + String(rollbackError?.message || rollbackError));
        }
      }
      throw error;
    }
  }));
}

export async function migrateLegacyChatSnapshotOnce() {
  if (!legacyMigrationPromise) {
    legacyMigrationPromise = recoverLegacyChatSnapshot().catch((error) => {
      legacyMigrationPromise = null;
      throw error;
    });
  }
  return legacyMigrationPromise;
}

async function recoverLegacyChatSnapshot() {
  const alreadyMigrated = await getLocalValue(LEGACY_MIGRATION_KEY, false, { strict:true });
  if (alreadyMigrated) return null;

  const existing = await jarvis.entities.Conversation
    .filter({ migration_id: LEGACY_MIGRATION_ID }, '-updated_date', 1);
  if (existing?.length) {
    await putLocalValue(LEGACY_MIGRATION_KEY, true);
    return existing[0];
  }

  const snapshot = await loadChatSnapshot({ strict:true });
  if (await hasConversationDeletion(jarvis.entities.Conversation, snapshot?.metadata?.conversationId, snapshot?.metadata?.offlineChatId)) {
    await putLocalValue(LEGACY_MIGRATION_KEY, true);
    return null;
  }
  const normalized = normalizeMessages(snapshot?.messages || []);
  if (!normalized.some((message) => message.role === 'user')) {
    await putLocalValue(LEGACY_MIGRATION_KEY, true);
    return null;
  }

  if (snapshot?.metadata?.conversationId || snapshot?.metadata?.offlineChatId) {
    const id = await saveConversationHistory(snapshot.metadata.conversationId, normalized, snapshot.metadata);
    const recovered = await jarvis.entities.Conversation.get(id);
    if (!recovered) throw new Error('CHAT_CONVERSATION_NOT_FOUND');
    await putLocalValue(LEGACY_MIGRATION_KEY, true);
    return recovered;
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

export async function saveChatSnapshotAfterMigration(messages, metadata = {}) {
  await migrateLegacyChatSnapshotOnce();
  return saveChatSnapshot(messages, metadata);
}

export async function queueConversationSyncAfterMigration(messages, metadata = {}) {
  await migrateLegacyChatSnapshotOnce();
  return queueConversationSync(messages, metadata);
}
