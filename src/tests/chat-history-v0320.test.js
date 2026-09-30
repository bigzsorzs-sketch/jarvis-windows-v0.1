import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const chat = fs.readFileSync('src/pages/Chat.jsx','utf8');
const orchestrator = fs.readFileSync('src/lib/chatOrchestrator.js','utf8');
const history = fs.readFileSync('src/lib/conversationHistory.js','utf8');
const chatUtils = fs.readFileSync('src/components/chat/chatUtils.jsx','utf8');
const header = fs.readFileSync('src/components/chat/ChatHeader.jsx','utf8');
const commandPanel = fs.readFileSync('src/components/command-center/CommandCenterChatPanel.jsx','utf8');

test('desktop chat starts clean while previous conversations stay in persistent history', () => {
  assert.doesNotMatch(chat, /loadChatSnapshot/);
  assert.match(chat, /conversationIdRef = useRef\(null\)/);
  assert.match(chat, /migrateLegacyChatSnapshotOnce/);
  assert.match(chat, /saveConversationHistory/);
  assert.match(chat, /listConversationHistory/);
  assert.match(chat, /ChatHistoryDrawer/);
  assert.match(chat, /startNewConversation/);
  assert.match(chat, /ACTIVE_CHAT_SESSION_KEY/);
  assert.match(chat, /sessionStorage\.removeItem\(ACTIVE_CHAT_SESSION_KEY\)/);
  assert.match(chat, /sessionStorage\.setItem\(ACTIVE_CHAT_SESSION_KEY, savedId\)/);
  assert.match(chat, /if \(conversationSaveSessionRef\.current !== savedSession\) return/);
  assert.match(chat, /getConversationHistory\(sessionConversationId\)/);
  assert.match(history, /jarvis\.entities\.Conversation\.create/);
  assert.match(history, /jarvis\.entities\.Conversation\.update/);
  assert.match(history, /source:\s*CHAT_SOURCE/);
  assert.match(history, /migratedFrom:\s*'indexeddb_active_chat'/);
});

test('history is reachable from both normal chat and the command center', () => {
  assert.match(header, /onHistory/);
  assert.match(header, /Beszélgetési előzmények/);
  assert.match(commandPanel, /onHistory/);
  assert.match(commandPanel, />\s*Előzmények\s*</);
});

test('ordinary chat only forwards relevant personal context to the external AI', () => {
  assert.match(orchestrator, /function resolveContextScope/);
  assert.match(orchestrator, /function scopePromptContext/);
  assert.match(orchestrator, /buildSystemPrompt\(scopedCtx/);
  assert.match(orchestrator, /attachedFiles\.length > 0 \|\| scopedSensitiveContext/);
  assert.doesNotMatch(orchestrator, /Boolean\(ctx\?\.memories\?\.length\)/);
  assert.match(orchestrator, /memories:\s*scope\.memory/);
  assert.match(orchestrator, /meds:\s*scope\.health/);
  assert.match(orchestrator, /contacts:\s*scope\.contacts/);
  assert.match(orchestrator, /finance:\s*scope\.finance/);
});

test('chat errors expose actionable causes instead of one generic failure', () => {
  assert.match(chat, /getChatErrorMessage/);
  assert.match(chatUtils, /OPENROUTER_API_KEY_REQUIRED/);
  assert.match(chatUtils, /OPENROUTER_\(401\|403\)/);
  assert.match(chatUtils, /OPENROUTER_402/);
  assert.match(chatUtils, /OPENROUTER_404/);
  assert.match(chatUtils, /OPENROUTER_429/);
  assert.match(chatUtils, /JARVIS_POLICY_USER_DENIED/);
});
