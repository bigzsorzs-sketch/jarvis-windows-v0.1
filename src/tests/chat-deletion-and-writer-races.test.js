import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as shared from '../lib/conversationMessages.js';

const messages = count => Array.from({ length:count }, (_, i) => ({ id:'msg-' + i, role:i % 2 ? 'assistant' : 'user', content:'text-' + i }));
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(res => { resolve = res; }); return { promise, resolve }; }
function harness(nativeApi = null) {
  const rows = [{ id:'existing', source:'chat', offline_sync_id:'session', messages:messages(3) }];
  let serial = 0;
  const api = {
    get:async id => structuredClone(rows.find(row => row.id === id) || null),
    filter:async query => structuredClone(rows.filter(row => Object.entries(query).every(([key, value]) => row[key] === value))),
    create:async data => { const row = { ...structuredClone(data), id:'new-' + (++serial) }; rows.push(row); return structuredClone(row); },
    update:async(id, data) => { const row = rows.find(item => item.id === id); if (!row) throw new Error('NOT_FOUND'); Object.assign(row, structuredClone(data)); return structuredClone(row); },
    delete:async id => { const index = rows.findIndex(row => row.id === id); if (index >= 0) rows.splice(index, 1); return { success:true }; },
  };
  const conversationApi = nativeApi || api;
  const context = { ...shared, Date, Promise, jarvis:{ entities:{ Conversation:conversationApi } } };
  const source = fs.readFileSync('src/lib/conversationHistory.js', 'utf8').replace(/^import .*;\n/gm, '').replace(/export /g, '');
  const history = vm.runInNewContext(source + ';({saveConversationHistory,deleteConversationHistory})', context);
  const worker = fs.readFileSync('src/lib/offlineSyncManager.js', 'utf8');
  const start = worker.indexOf('async function syncConversationSnapshot(');
  const end = worker.indexOf('\nexport async function syncOfflineData(', start);
  const sync = vm.runInNewContext(worker.slice(start, end) + ';syncConversationSnapshot', context);
  const snapshot = linked => ({ id:'queue-session', payload:{ updatedAt:Date.now(), messages:messages(4), metadata:{ offlineChatId:'session', ...(linked ? { conversationId:'existing' } : {}) } } });
  return { rows, api, history, sync, snapshot };
}

for (const linked of [true, false]) {
  test(`deleting a chat prevents its queued ${linked ? 'linked' : 'unlinked'} offline snapshot from recreating it`, async() => {
    const h = harness();
    const item = h.snapshot(linked);
    await h.history.deleteConversationHistory('existing');
    assert.equal(await h.sync(item, { email:'local@jarvis' }), null);
    assert.equal(h.rows.filter(row => row.source === 'chat').length, 0);
    const marker = h.rows.find(row => row.source === 'chat-deletion');
    assert.ok(marker);
    assert.deepEqual(marker.messages, []);
    assert.equal(JSON.stringify(marker).includes('text-'), false);
  });
}

test('a delayed online first-save cannot recreate a user-deleted offline session', async() => {
  const h = harness();
  await h.history.deleteConversationHistory('existing');
  await assert.rejects(() => h.history.saveConversationHistory(null, messages(5), { offlineChatId:'session' }), /CHAT_CONVERSATION_DELETED/);
  assert.equal(h.rows.filter(row => row.source === 'chat').length, 0);
});

test('a failed delete rolls back its marker and leaves the chat writable', async() => {
  const h = harness();
  const originalDelete = h.api.delete;
  h.api.delete = async id => { if (id === 'existing') throw new Error('SQLITE_BUSY'); return originalDelete(id); };
  await assert.rejects(() => h.history.deleteConversationHistory('existing'), /SQLITE_BUSY/);
  assert.equal(h.rows.filter(row => row.source === 'chat-deletion').length, 0);
  await h.history.saveConversationHistory('existing', messages(4), { offlineChatId:'session' });
  assert.equal(h.rows[0].messages.length, 4);
});

test('online saving and offline recovery serialize the actual read-merge-write operations', async() => {
  const h = harness();
  const gate = deferred();
  const update = h.api.update;
  let calls = 0;
  h.api.update = async(...args) => { calls += 1; if (calls === 1) await gate.promise; return update(...args); };
  const online = h.history.saveConversationHistory('existing', messages(5), { offlineChatId:'session' });
  await tick();
  const offline = h.sync(h.snapshot(true), { email:'local@jarvis' });
  await tick();
  gate.resolve();
  await Promise.all([online, offline]);
  assert.equal(h.rows[0].messages.length, 5);
  assert.equal(h.rows[0].messages.at(-1).id, 'msg-4');
});

test('concurrent initial online saves resolve to one persistent conversation', async() => {
  const h = harness();
  h.rows.length = 0;
  const results = await Promise.all([
    h.history.saveConversationHistory(null, messages(3), { offlineChatId:'session' }),
    h.history.saveConversationHistory(null, messages(4), { offlineChatId:'session' }),
  ]);
  assert.equal(results[0], results[1]);
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].messages.length, 4);
});

test('deletion recovery uses durable markers in the real SQLite store after reopening', async t => {
  const require = createRequire(import.meta.url);
  const { LocalDatabase } = require('../../electron/data/local-database.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-deletion-sqlite-'));
  const file = path.join(root, 'jarvis.sqlite3');
  let db = new LocalDatabase(file);
  t.after(() => { db.close(); fs.rmSync(root, { recursive:true, force:true }); });
  const api = {
    get:async id => db.filter('Conversation', { id }, null, 1)[0] || null,
    filter:async(...args) => db.filter('Conversation', ...args),
    create:async data => db.create('Conversation', data),
    update:async(id, data) => db.update('Conversation', id, data),
    delete:async id => db.delete('Conversation', id),
  };
  const row = await api.create({ source:'chat', offline_sync_id:'session', messages:messages(3) });
  const h = harness(api);
  await h.history.deleteConversationHistory(row.id);
  db.close();
  db = new LocalDatabase(file);
  assert.equal(await h.sync(h.snapshot(false), db.getUser()), null);
  assert.equal(db.filter('Conversation', { source:'chat' }).length, 0);
  assert.equal(db.filter('Conversation', { source:'chat-deletion' }).length, 1);
});
