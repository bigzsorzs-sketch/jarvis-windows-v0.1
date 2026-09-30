import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { localDateKey, addDaysToDateKey } from '../lib/localDate.js';
import { summarizeActionResults } from '../lib/assistantResponseHandler.js';

const require = createRequire(import.meta.url);
const { LocalDatabase } = require('../../electron/data/local-database.cjs');
const read = (file) => fs.readFileSync(file, 'utf8');

test('assistant action planning never executes before the chat confirmation gate', () => {
  const orchestrator = read('src/lib/chatOrchestrator.js');
  const chat = read('src/pages/Chat.jsx');
  const tools = read('src/lib/assistantTools.js');

  assert.equal(orchestrator.includes('await executeActions(actions)'), false);
  assert.equal(orchestrator.includes('actionResults: []'), true);
  assert.equal(chat.includes('const requiresConfirmation = actions.some'), true);
  assert.equal(chat.includes('actionResults = await executeActions(actions'), true);
  assert.equal(chat.includes('preapprovedTools:confirmation.preapprovedTools || []'), true);
  assert.equal(chat.includes('const confirmingSession = conversationSaveSessionRef.current'), true);
  assert.equal(chat.includes('if (!isCurrentConfirmation()) return'), true);
  assert.equal(chat.includes('conversation={('), true);
  assert.equal(chat.includes('<ChatConfirmBar'), true);
  assert.equal(tools.includes("approvalMode === 'confirm' && !preapprovedTools.has"), true);
});

test('single-owner build does not expose a permanently failing invite control', () => {
  const settings = read('src/pages/Beallitasok.jsx');
  const client = read('src/api/jarvisClient.js');
  assert.equal(settings.includes('InviteUserCard'), false);
  assert.equal(settings.includes('sendInvite'), false);
  assert.equal(client.includes("throw new Error('LOCAL_SINGLE_OWNER_MODE')"), true);
});

test('database create and update protect ownership and identity metadata', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-owner-test-'));
  const db = new LocalDatabase(path.join(dir, 'jarvis.sqlite3'));
  try {
    const created = db.create('Note', {
      id:'spoofed-id',
      created_by:'attacker@example.com',
      created_date:'2000-01-01T00:00:00.000Z',
      text:'safe'
    });
    assert.notEqual(created.id, 'spoofed-id');
    assert.equal(created.created_by, 'owner@jarvis.local');
    assert.notEqual(created.created_date, '2000-01-01T00:00:00.000Z');

    const updated = db.update('Note', created.id, {
      id:'changed-id',
      created_by:'attacker@example.com',
      created_date:'1999-01-01T00:00:00.000Z',
      text:'updated'
    });
    assert.equal(updated.id, created.id);
    assert.equal(updated.created_by, 'owner@jarvis.local');
    assert.equal(updated.created_date, created.created_date);
    assert.equal(updated.text, 'updated');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive:true, force:true });
  }
});

test('calendar keys use the requested local timezone instead of UTC day boundaries', () => {
  assert.equal(localDateKey(new Date('2026-06-01T23:30:00.000Z'), 'Europe/London'), '2026-06-02');
  assert.equal(addDaysToDateKey('2026-03-29', 1), '2026-03-30');
  assert.equal(addDaysToDateKey('2026-12-31', 1), '2027-01-01');
});

test('external AI and updater calls have bounded network waits', () => {
  const main = read('electron/main.cjs');
  assert.equal(main.includes('async function withNetworkTimeout'), true);
  for (const marker of [
    "withNetworkTimeout(15000, 'OPENROUTER_CONNECTION'",
    "withNetworkTimeout(120000, 'OPENROUTER_IMAGE'",
    "withNetworkTimeout(15000, 'OPENROUTER_SPEECH_MODELS'",
    "withNetworkTimeout(45000, 'OPENROUTER_TTS'",
    "withNetworkTimeout(15000, 'UPDATE_CHECK'",
    "withNetworkTimeout(10 * 60 * 1000, 'UPDATE_DOWNLOAD'",
    "withNetworkTimeout(15000, 'OPENROUTER_MODELS'",
  ]) {
    assert.equal(main.includes(marker), true, marker);
  }
});

test('encrypted browser backup migrates raw key material out of localStorage', () => {
  const backup = read('src/lib/encryptedLocalBackup.js');
  assert.equal(backup.includes("const KEY_DB_NAME = 'jarvis_secure_keystore_v1'"), true);
  assert.equal(backup.includes('indexedDB.open(KEY_DB_NAME, 1)'), true);
  assert.equal(backup.includes('key_storage: \'indexeddb-nonextractable\''), true);
  assert.equal(backup.includes('localStorage.removeItem(LEGACY_DEVICE_SECRET_KEY)'), true);
  assert.equal(backup.includes('localStorage.setItem(LEGACY_DEVICE_SECRET_KEY'), false);
});

test('action summaries follow the conversation language', () => {
  assert.equal(summarizeActionResults([{ result:{ success:true } }], 'hu-HU'), 'Kész.');
  assert.equal(
    summarizeActionResults([{ result:{ success:false } }], 'hu'),
    'A művelet nem sikerült. Próbáld újra.'
  );
  assert.equal(summarizeActionResults([{ result:{ success:true } }], 'en'), 'Done.');
});

test('backup restore always re-establishes the local owner identity', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-restore-owner-test-'));
  const db = new LocalDatabase(path.join(dir, 'jarvis.sqlite3'));
  try {
    db.importSnapshot({
      user:{ id:'remote-user', role:'user', email:'restored@example.com' },
      entities:{}
    });
    const user = db.getUser();
    assert.equal(user.id, 'local-owner');
    assert.equal(user.role, 'owner');
    assert.equal(user.email, 'restored@example.com');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive:true, force:true });
  }
});

test('route actions have a single offline queue and legacy duplicates are discarded', () => {
  const routeQueue = read('src/lib/routeOfflineQueue.js');
  const sync = read('src/lib/offlineSyncManager.js');
  assert.equal(routeQueue.includes('enqueueSyncAction'), false);
  assert.equal(routeQueue.includes('Route actions use this queue as their single source of truth.'), true);
  assert.equal(sync.includes('Route sync has its own authoritative local queue.'), true);
  assert.equal(sync.includes("item.type?.startsWith('route_')"), true);
  assert.equal(sync.includes('if (!await mutateSyncActionIfUnchanged(item)) rescanNeeded = true;\n          continue;'), true);
  assert.equal(sync.includes('await removeSyncAction(item.id);'), false);
});

test('obsolete Home page is removed and route state initial messages are consumed once', () => {
  const app = read('src/App.jsx');
  const chat = read('src/pages/Chat.jsx');
  assert.equal(fs.existsSync('src/pages/Home.jsx'), false);
  assert.equal(app.includes("import Home from './pages/Home'"), false);
  assert.equal(chat.includes('location.state?.initialMessage'), true);
  assert.equal(chat.includes('initialMessageRef.current === initial'), true);
  assert.equal(chat.includes('navigate(location.pathname, { replace:true, state:null })'), true);
});
