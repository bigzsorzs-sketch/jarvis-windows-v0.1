import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repair = require('../../electron/developer-repair.cjs');
const read = (file) => fs.readFileSync(file,'utf8');

function workspace() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-manual-repair-'));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'jarvis-desktop'}));
  fs.mkdirSync(path.join(root,'src'),{recursive:true});
  fs.writeFileSync(path.join(root,'src','sample.js'),'const value = 1;\n');
  return root;
}

test('v0.3.18 removes legacy Self-Repair Autopilot runtime and IPC', () => {
  const main = read('electron/main.cjs');
  const preload = read('electron/preload.cjs');
  assert.equal(main.includes('runAutonomousSelfRepair'), false);
  assert.equal(main.includes('generateAutonomousRepairProposal'), false);
  assert.equal(main.includes('jarvis:self-repair:auto:'), false);
  assert.equal(main.includes('scheduleCrashAutopilot'), false);
  assert.equal(preload.includes('runAutonomous'), false);
  assert.equal(preload.includes('prepareAutonomousWorkspace'), false);
});

test('repair-specific sandbox engine and legacy developer IPC are removed', () => {
  const main = read('electron/main.cjs');
  const engine = read('electron/developer-repair.cjs');
  const preload = read('electron/preload.cjs');
  const upgrade = read('src/pages/UpgradeCenter.jsx');
  assert.equal(engine.includes('function createSandbox('), false);
  assert.equal(engine.includes('function destroySandbox('), false);
  assert.equal(main.includes('jarvis:developer:sandbox'), false);
  assert.equal(main.includes('developer-repair-sandboxes'), false);
  assert.equal(preload.includes('jarvis:developer:sandbox'), false);
  assert.equal(upgrade.includes('Futtatás izolált sandboxban'), false);
});

test('manual repair uses explicit owner plan, backup, direct apply and rollback', () => {
  const root=workspace();
  const plan=repair.validateOwnerPlan(root,{goal:'fix',patches:[{file:'src/sample.js',content:'const value = 2;\n'}]});
  const backup=repair.snapshotOwner(root,plan,fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-owner-backup-')));
  repair.applyOwner(root,plan);
  assert.equal(fs.readFileSync(path.join(root,'src','sample.js'),'utf8'),'const value = 2;\n');
  repair.rollbackOwner(root,backup);
  assert.equal(fs.readFileSync(path.join(root,'src','sample.js'),'utf8'),'const value = 1;\n');
});

test('manual conversation repair builds and restarts into the accepted source', () => {
  const main = read('electron/main.cjs');
  const system = read('src/pages/SystemCenter.jsx');
  const preload = read('electron/preload.cjs');
  assert.match(main,/jarvis:self-repair:manual:apply/);
  assert.match(main,/validateDirectOwnerRepair/);
  assert.match(main,/ensureManualRuntimeBuilt/);
  assert.match(main,/scheduleManualRuntimeRestart/);
  assert.match(main,/handOffToManualRuntimeIfReady/);
  assert.match(main,/APPLIED_AND_RESTARTING/);
  assert.match(system,/applyPendingRepair/);
  assert.match(system,/Build \+ újraindítás/);
  assert.match(preload,/applyPending/);
});

test('Chromium renderer security sandbox remains enabled independently', () => {
  const main = read('electron/main.cjs');
  assert.match(main,/webPreferences:\{[\s\S]*sandbox:true/);
});

test('release version is synchronized across package, lockfile and app source', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const versionSource = read('src/lib/appVersion.js');
  const match = versionSource.match(/APP_VERSION\s*=\s*'([^']+)'/);

  assert.ok(/^\d+\.\d+\.\d+$/.test(pkg.version));
  assert.equal(lock.version,pkg.version);
  assert.equal(lock.packages[''].version,pkg.version);
  assert.equal(match?.[1],pkg.version);
});
