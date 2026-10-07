import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repair = require('../../electron/developer-repair.cjs');
const main = fs.readFileSync('electron/main.cjs', 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(res => { resolve = res; }); return { promise, resolve }; }

function harness(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-planning-'));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name:'jarvis-desktop', version:'0.3.25' }));
  const file = path.join(root, 'src', 'example.js');
  fs.writeFileSync(file, 'export const answer = 1;\n');
  const stored = new Map();
  const context = {
    console, Date, String, Array, fs, path,
    manualRepairApplyInFlight:false, manualRepairRequestEpoch:0, manualRepairPlans:new Map(),
    clearPendingManualRepairPlans:() => { stored.clear(); context.manualRepairPlans.clear(); },
    getSelfRepairRoot:async() => root,
    selfRepairSourceFingerprint:() => fs.readFileSync(file, 'utf8'),
    developerRepair:{ ...repair, buildDiagnosticContext:() => ({ map:{}, excerpts:[{
      path:'src/example.js', excerpt:fs.readFileSync(file, 'utf8'), lines:1, complete:options.complete !== false,
    }] }) },
    selfRepairLearning:null, adminDiagnosticsManager:options.admin || null,
    app:{ getVersion:() => '0.3.25' }, readRecentCrashes:() => options.crashes || [], canonicalAppVersion:value => value,
    parseRepairModelJson:JSON.parse,
    persistManualRepairPlan:entry => {
      if (options.persistenceFails) throw new Error('DISK_FULL');
      stored.set(entry.plan.hash, entry);
    },
    openRouterRequest:async input => {
      const request = input.prompt.match(/OWNER(?: REQUEST)?:\n([^\n]+)/)?.[1] || '';
      if (options.model) await options.model(input, request, context, file);
      if (!input.response_json_schema) return { data:{ result:'Diagnózis: hibás érték.' } };
      const goal = request.includes('második') ? 'second' : 'first';
      const patches = options.patches || [{ file:'src/example.js', replacements:[{ search:'answer = 1', replace:'answer = 2' }] }];
      return { data:{ result:JSON.stringify({ goal, rationale:'confirmed source defect', risk:'low', patches }) } };
    },
  };
  const start = main.indexOf('function selfRepairRequestMode(');
  const end = main.indexOf('\nfunction parseRepairModelJson(', start);
  assert.ok(start >= 0 && end > start, 'actual Self-Repair chat function must be found');
  const chat = vm.runInNewContext(main.slice(start, end) + '; selfRepairChat', context);
  return { chat, context, stored, file };
}

test('an older diagnostic request cannot recreate a proposal invalidated by a newer request', async t => {
  const gate = deferred();
  const h = harness(t, { model:async(input, request) => {
    if (!input.response_json_schema && request.includes('első')) await gate.promise;
  } });
  const first = h.chat({ message:'Javítsd az első hibát' }).then(value => value, error => error);
  await tick();
  const second = await h.chat({ message:'Javítsd a második hibát' });
  assert.ok(second.data.pendingRepair.hash);
  gate.resolve();
  const old = await first;
  assert.match(String(old?.message || old?.data?.pendingRepair?.error || ''), /SELF_REPAIR_REQUEST_SUPERSEDED/);
  assert.equal(h.stored.size, 1);
  assert.equal([...h.stored.values()][0].plan.goal, 'second');
});

test('a diagnostic started before apply cannot publish a new proposal during apply', async t => {
  const gate = deferred();
  const h = harness(t, { model:async input => { if (!input.response_json_schema) await gate.promise; } });
  const result = h.chat({ message:'Javítsd a hibát' }).then(value => value, error => error);
  await tick();
  h.context.manualRepairApplyInFlight = true;
  gate.resolve();
  const value = await result;
  assert.match(String(value?.message || value?.data?.pendingRepair?.error || ''), /MANUAL_REPAIR_ALREADY_IN_PROGRESS/);
  assert.equal(h.stored.size, 0);
});

test('source changes during model analysis invalidate the proposal before persistence', async t => {
  const h = harness(t, { model:async(input, _request, _context, file) => {
    if (input.response_json_schema) fs.writeFileSync(file, 'export const answer = 1; // newer source\n');
  } });
  const result = await h.chat({ message:'Javítsd a hibát' });
  assert.match(result.data.pendingRepair?.error || '', /SELF_REPAIR_SOURCE_CHANGED/);
  assert.equal(h.stored.size, 0);
});

test('failed durable plan persistence leaves no apparently usable RAM proposal', async t => {
  const h = harness(t, { persistenceFails:true });
  const result = await h.chat({ message:'Javítsd a hibát' });
  assert.match(result.data.pendingRepair.error, /DISK_FULL/);
  assert.equal(h.context.manualRepairPlans.size, 0);
});

test('the approval response contains the exact patches protected by its persisted hash', async t => {
  const h = harness(t);
  const result = await h.chat({ message:'Javítsd a hibát' });
  const pending = result.data.pendingRepair;
  assert.ok(Array.isArray(pending.patches));
  assert.deepEqual(JSON.parse(JSON.stringify(pending.patches)), JSON.parse(JSON.stringify(h.stored.get(pending.hash).plan.patches)));
  const plan = { ...h.stored.get(pending.hash).plan };
  delete plan.hash;
  assert.equal(repair.proposalHash(plan), pending.hash);
  assert.equal(fs.readFileSync(h.file, 'utf8'), 'export const answer = 1;\n');
});

test('a whole-file patch cannot be formed from a truncated diagnostic excerpt', async t => {
  const h = harness(t, { complete:false, patches:[{ file:'src/example.js', content:'export const answer = 2;\n' }] });
  const result = await h.chat({ message:'Javítsd a hibát' });
  assert.match(result.data.pendingRepair?.error || '', /SELF_REPAIR_FULL_SOURCE_REQUIRED/);
  assert.equal(h.stored.size, 0);
});

test('already-correct full-file and replacement plans are rejected without mutation', t => {
  const h = harness(t);
  for (const patch of [
    { file:'src/example.js', content:fs.readFileSync(h.file, 'utf8') },
    { file:'src/example.js', replacements:[{ search:'answer = 1', replace:'answer = 1' }] },
  ]) {
    assert.throws(() => repair.validateOwnerPlan(path.dirname(path.dirname(h.file)), { patches:[patch] }), /DEV_REPAIR_NO_CHANGES/);
  }
});

test('repair planning retains the sensitive-context flag of the diagnostic it uses', async t => {
  const requests = [];
  const h = harness(t, { crashes:[{ appVersion:'0.3.25', details:{ userPath:'private diagnostic' } }],
    model:async input => requests.push(input) });
  await h.chat({ message:'Javítsd a hibát' });
  assert.equal(requests.length, 2);
  assert.ok(requests.every(input => input.contains_sensitive_context === true));
});

test('ending an admin session cannot relabel its already captured diagnostic as non-sensitive', async t => {
  let active = true;
  const requests = [];
  const h = harness(t, { admin:{ isActive:() => active, snapshot:async() => ({ userPath:'private-admin-snapshot' }) },
    model:async input => { requests.push(input); active = false; } });
  await h.chat({ message:'Javítsd a hibát' });
  assert.equal(requests.length, 2);
  assert.ok(requests[0].prompt.includes('private-admin-snapshot'));
  assert.ok(requests.every(input => input.contains_sensitive_context === true));
});

test('the local repair gate includes the production dependency audit and stops on failure', async () => {
  const start = main.indexOf('async function ensureManualRuntimeBuilt(');
  const end = main.indexOf('\nfunction scheduleManualRuntimeRestart(', start);
  const calls = [];
  const build = vm.runInNewContext(main.slice(start, end) + ';ensureManualRuntimeBuilt', {
    path, Date, app:{ getVersion:() => '0.3.25' },
    manualRuntimeElectronPath:() => '/workspace/node_modules/electron/dist/electron.exe',
    fs:{ existsSync:() => true, readdirSync:() => ['example.test.js'] },
    runToolchainNpm:async args => {
      calls.push(args.join(' '));
      if (args[0] === 'audit') throw new Error('VULNERABLE_DEPENDENCY');
    },
    runToolchainNode:async args => calls.push(args.join(' ')),
    selfRepairToolchainPaths:() => ({ root:'/toolchain' }), readJson:() => ({}),
    manualWorkspaceSourceStatePath:() => '/source-state.json', selfRepairSourceFingerprint:() => 'source',
    manualRuntimeFingerprint:() => 'runtime', writeJson:() => {}, manualRuntimeStatePath:() => '/runtime.json', installedExecutable:() => '/Jarvis.exe',
    selfRepairSourceRoot:() => '/installed',
  });
  await assert.rejects(() => build('/workspace'), /VULNERABLE_DEPENDENCY/);
  assert.ok(calls.includes('audit --omit=dev --audit-level=moderate'));
  assert.equal(calls.includes('run build'), false);
});

test('interrupted settings/plan writes retain the previous valid JSON', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-atomic-plan-'));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  const file = path.join(root, 'settings.json');
  fs.writeFileSync(file, '{"token":"protected-existing-token"}');
  const failingFs = { ...fs, writeFileSync:(target, ...args) => {
    fs.writeFileSync(target, String(args[0]).slice(0, 9));
    throw new Error('DISK_WRITE_INTERRUPTED');
  } };
  const start = main.indexOf('function writeJson(');
  const end = main.indexOf('\nfunction protectSecret(', start);
  const write = vm.runInNewContext(main.slice(start, end) + '; writeJson', { fs:failingFs, path, process, Date });
  assert.throws(() => write(file, { token:'new-token' }), /DISK_WRITE_INTERRUPTED/);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { token:'protected-existing-token' });
  assert.deepEqual(fs.readdirSync(root), ['settings.json']);
});
