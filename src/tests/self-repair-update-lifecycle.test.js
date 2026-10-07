import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';

const main = fs.readFileSync('electron/main.cjs', 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(res => { resolve = res; }); return { promise, resolve }; }

function harness(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "Jarvis Őr's update "));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  const events = [];
  const checksum = 'a'.repeat(64);
  let helperPath;
  let fetches = 0;
  const start = main.indexOf('async function oneClickUpdate(');
  const end = main.indexOf('\nfunction payloadContainsSensitiveContext(', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    fs, path, Date, process, Promise, Buffer,
    app:{ getVersion:() => '0.3.25', getPath:() => root, quit:() => events.push('quit') },
    fetchLatestRelease:async() => {
      fetches += 1;
      if (options.releaseGate) await options.releaseGate.promise;
      return { latestVersion:'0.3.26', targetCommitish:'b'.repeat(40),
        exe:{ name:'Jarvis-Setup-0.3.26-x64.exe', browser_download_url:'installer' },
        checksum:{ browser_download_url:'checksum' }, manifest:{ browser_download_url:'manifest' } };
    },
    compareVersions:() => 1,
    downloadFile:async(url, file) => fs.writeFileSync(file, url === 'checksum' ? checksum : url === 'manifest' ? '{}' : 'installer'),
    sha256File:async() => checksum,
    githubSelfRepair:{ verifyReleaseManifest:() => events.push('verified-manifest') },
    verifyUpdateSigner:async() => ({ verification:'sha256' }),
    installedExecutable:() => path.join(root, 'Jarvis.exe'),
    psQuote:value => String(value).replace(/'/g, "''"),
    setTimeout:callback => { events.push('quit-scheduled'); if (options.runQuit) callback(); },
    spawn:(_exe, args) => {
      helperPath = args.at(-1);
      events.push('spawn-called');
      const child = new EventEmitter();
      child.on('error', () => events.push('spawn-error'));
      child.unref = () => events.push('unref');
      queueMicrotask(() => child.emit(options.spawnFails ? 'error' : 'spawn', new Error('ENOENT_POWERSHELL')));
      return child;
    },
  };
  const update = vm.runInNewContext('let oneClickUpdatePromise = null;\n' + main.slice(start, end) + ';oneClickUpdate', context);
  return { update, events, root, get helperPath() { return helperPath; }, get fetches() { return fetches; } };
}

test('two concurrent update requests share one verified download and one installer helper', async t => {
  const gate = deferred();
  const h = harness(t, { releaseGate:gate });
  const first = h.update();
  const second = h.update();
  await tick();
  const fetches = h.fetches;
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal(fetches, 1);
  assert.equal(h.events.filter(event => event === 'spawn-called').length, 1);
});

test('failed PowerShell spawn rejects the update and never schedules Jarvis shutdown', async t => {
  const h = harness(t, { spawnFails:true });
  await assert.rejects(h.update(), /ENOENT_POWERSHELL/);
  assert.equal(h.events.includes('quit-scheduled'), false);
  assert.equal(h.events.includes('unref'), false);
});

test('successful helper spawn happens before installation status and scheduled shutdown', async t => {
  const h = harness(t);
  const result = await h.update();
  assert.equal(result.status, 'installing');
  assert.deepEqual(h.events.slice(-3), ['spawn-called', 'unref', 'quit-scheduled']);
  assert.equal(h.events.includes('quit'), false);
});

test('installer helpers preserve Unicode paths for native Windows PowerShell 5', async t => {
  const h = harness(t);
  await h.update();
  const script = fs.readFileSync(h.helperPath, 'utf8');
  assert.equal(script.charCodeAt(0), 0xFEFF, 'PowerShell 5 requires a BOM for UTF-8 script paths');
  assert.ok(script.includes("Jarvis Őr''s update"));
});

test('native Windows update helper encoding round-trips a harmless Unicode path', { skip:process.platform !== 'win32' }, async t => {
  const h = harness(t);
  await h.update();
  const script = fs.readFileSync(h.helperPath, 'utf8');
  const literal = script.match(/^\$userData = (.+)$/m)?.[1];
  assert.ok(literal);
  const probe = path.join(h.root, 'encoding-probe.ps1');
  const result = path.join(h.root, 'encoding-result.txt');
  fs.writeFileSync(probe, script.slice(0, 1) + `$value = ${literal}\n[IO.File]::WriteAllText($env:JARVIS_ENCODING_PROBE, $value)\n`, 'utf8');
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probe], {
    timeout:30000, windowsHide:true, env:{ ...process.env, JARVIS_ENCODING_PROBE:result },
  });
  assert.equal(fs.readFileSync(result, 'utf8'), h.root);
});
