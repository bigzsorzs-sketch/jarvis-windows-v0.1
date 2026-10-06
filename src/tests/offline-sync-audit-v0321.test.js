import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getRetryDelayMs, isReadyForRetry, MAX_SYNC_RETRIES } from '../lib/offlineSyncRules.js';

test('failed offline items are retried with bounded exponential backoff', () => {
  assert.equal(getRetryDelayMs(1), 30_000);
  assert.equal(getRetryDelayMs(2), 60_000);
  assert.equal(getRetryDelayMs(3), 120_000);
  assert.equal(getRetryDelayMs(10), 30 * 60 * 1000);
});

test('offline sync resumes entries stranded in syncing state by a crash', () => {
  const now = Date.now();
  assert.equal(isReadyForRetry({ type:'conversation_snapshot',status:'pending' }, now),true);
  assert.equal(isReadyForRetry({ type:'conversation_snapshot',status:'syncing' }, now),true);
  assert.equal(isReadyForRetry({ type:'conversation_snapshot',status:'failed',retry_count:2,next_retry_at:now-1 }, now),true);
  assert.equal(isReadyForRetry({ type:'conversation_snapshot',status:'failed',retry_count:2,next_retry_at:now+60_000 }, now),false);
  assert.equal(isReadyForRetry({ type:'conversation_snapshot',status:'failed',retry_count:MAX_SYNC_RETRIES }, now),false);
  assert.equal(isReadyForRetry({ type:'conversation_snapshot',status:'unknown' }, now),false);
});

test('retry exhaustion retains the unsynced payload for manual recovery', () => {
  const source = fs.readFileSync('src/lib/offlineSyncManager.js','utf8');
  const start = source.indexOf('if (retryCount >= MAX_SYNC_RETRIES)');
  const end = source.indexOf('continue;',start);
  assert.ok(start >= 0 && end > start);
  const exhausted = source.slice(start,end);
  assert.match(exhausted, /mutateSyncActionIfUnchanged\(item/);
  assert.match(exhausted, /requires_manual_retry: true/);
  assert.doesNotMatch(exhausted, /removeSyncAction\(item\.id\)/);
});

test('offline chat does not promise a response without re-sending the AI request', () => {
  const chat = fs.readFileSync('src/pages/Chat.jsx','utf8');
  const offline = chat.slice(chat.indexOf('if (networkMonitor.isOffline())'),chat.indexOf('if (networkMonitor.isOffline())')+900);
  assert.match(offline, /nem válaszol automatikusan/);
  assert.match(offline, /küldd el újra/);
  assert.doesNotMatch(offline, /telefonodon/);
});

test('manual self-repair parses the entire source before any GitHub mutation', () => {
  const main = fs.readFileSync('electron/main.cjs','utf8');
  const workflow = fs.readFileSync('.github/workflows/build-windows.yml','utf8');
  const builderStart = main.indexOf('async function ensureManualRuntimeBuilt(');
  const builderEnd = main.indexOf('function clearLegacyManualRuntimeState(',builderStart);
  const builder = main.slice(builderStart,builderEnd);
  const applyStart = main.indexOf("ipcMain.handle('jarvis:self-repair:manual:apply'");
  const applyEnd = main.indexOf("ipcMain.handle('jarvis:repair:apply'",applyStart);
  const apply = main.slice(applyStart,applyEnd);
  assert.ok(builderStart > 0 && builderEnd > builderStart);
  assert.match(builder,/runToolchainNode\(\['scripts\/audit-all-source\.cjs'\]/);
  assert.ok(apply.indexOf('await ensureManualRuntimeBuilt') < apply.indexOf('await client.createRepairPullRequest'));
  assert.doesNotMatch(apply,/scheduleManualRuntimeRestart/);
  assert.match(workflow,/node scripts\/audit-all-source\.cjs/);
});
