import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repair = require('../../electron/developer-repair.cjs');
const read = (file) => fs.readFileSync(file,'utf8');

test('manual Self-Repair workspace never installs dependencies automatically', () => {
  const main = read('electron/main.cjs');
  const start = main.indexOf('async function ensureManualRepairWorkspace()');
  const end = main.indexOf('function crashLogPath()', start);
  assert.ok(start >= 0 && end > start);
  const manual = main.slice(start,end);
  assert.equal(manual.includes("runToolchainNpm(['ci']"), false);
  assert.equal(manual.includes('manual-self-repair'), true);
});

test('manual repair can owner-approve core code but still blocks security and release infrastructure', () => {
  assert.equal(typeof repair.validateOwnerPlan, 'function');
  assert.throws(
    () => repair.validateOwnerPlan(process.cwd(),{patches:[{file:'security/core-rules.json',content:'{}'}]}),
    /DEV_REPAIR_OWNER_BLOCKED_PATH/
  );
  assert.throws(
    () => repair.validateOwnerPlan(process.cwd(),{patches:[{file:'.github/workflows/build-windows.yml',content:'x'}]}),
    /DEV_REPAIR_OWNER_BLOCKED_PATH/
  );
});

test('manual repair UI requires explicit Accept and has no visible Autopilot panel', () => {
  const system = read('src/pages/SystemCenter.jsx');
  const preload = read('electron/preload.cjs');
  assert.equal(system.includes('Elfogadom'), true);
  assert.equal(system.includes('applyPendingRepair'), true);
  assert.equal(system.includes('Autopilot önfejlesztés'), false);
  assert.equal(preload.includes('applyPending'), true);
  assert.equal(preload.includes('runAutonomous'), false);
  assert.equal(preload.includes('prepareAutonomousWorkspace'), false);
});

test('manual apply uses backup, direct apply and lightweight validation without sandbox', () => {
  const main = read('electron/main.cjs');
  assert.match(main,/jarvis:self-repair:manual:apply/);
  assert.match(main,/snapshotOwner/);
  assert.match(main,/applyOwner/);
  assert.match(main,/validateDirectOwnerRepair/);
  const handlerStart = main.indexOf("ipcMain.handle('jarvis:self-repair:manual:apply'");
  const handlerEnd = main.indexOf("ipcMain.handle('jarvis:self-repair:auto:status'",handlerStart);
  const handler = main.slice(handlerStart,handlerEnd);
  assert.equal(handler.includes('createSandbox'), false);
  assert.equal(handler.includes("runToolchainNpm(['ci']"), false);
});

test('v0.3.16 version is synchronized', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const versionSource = read('src/lib/appVersion.js');
  assert.equal(pkg.version,'0.3.16');
  assert.equal(lock.version,pkg.version);
  assert.equal(lock.packages[''].version,pkg.version);
  assert.equal(versionSource.includes("APP_VERSION = '0.3.16'"),true);
});
