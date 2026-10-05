import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repair = require('../../electron/developer-repair.cjs');
const main = fs.readFileSync('electron/main.cjs','utf8');
const preload = fs.readFileSync('electron/preload.cjs','utf8');
const view = fs.readFileSync('src/pages/SystemCenter.jsx','utf8');

test('only one main-process repair apply can run and chat cannot invalidate it mid-flight', () => {
  assert.match(main, /let manualRepairApplyInFlight = false/);
  assert.match(main, /async function selfRepairChat\(payload=\{\}\) \{\s*if \(manualRepairApplyInFlight\) throw new Error\('MANUAL_REPAIR_ALREADY_IN_PROGRESS'\)/);
  const start = main.indexOf("ipcMain.handle('jarvis:self-repair:manual:apply'");
  const end = main.indexOf("ipcMain.handle('jarvis:repair:apply'",start);
  const body = main.slice(start,end);
  assert.match(body, /if \(manualRepairApplyInFlight\) throw new Error\('MANUAL_REPAIR_ALREADY_IN_PROGRESS'\)/);
  assert.match(body, /manualRepairApplyInFlight = true;\s*try \{/);
  assert.match(body, /finally \{\s*manualRepairApplyInFlight = false;\s*\}/);
});

test('a new self-repair request invalidates old proposals in both layers', () => {
  assert.match(main, /async function selfRepairChat\([\s\S]*?clearPendingManualRepairPlans\(\)/);
  assert.match(main, /function clearPendingManualRepairPlans\(\)\s*\{[\s\S]*?manualRepairPlans\.clear\(\)/);
  assert.match(view, /pendingRequestEpoch\.current \+= 1;\s*setPendingRepair\(null\)/);
  assert.match(view, /disabled=\{manualApplyBusy \|\| chatBusy \|\| !pendingRepair\?\.hash\}/);
});

test('pending approvals can be restored but are bound to the exact workspace state', () => {
  assert.match(main, /workspaceSourceFingerprint:selfRepairSourceFingerprint\(entry\.workspace\)/);
  assert.match(main, /saved\.workspaceSourceFingerprint !== selfRepairSourceFingerprint\(manualRepairWorkspaceRoot\(\)\)/);
  assert.match(main, /Date\.now\(\) - Number\(saved\.createdAt \|\| 0\) > 60 \* 60 \* 1000/);
  assert.match(main, /jarvis:self-repair:manual:pending/);
  assert.match(preload, /getPending: \(\) => ipcRenderer\.invoke\('jarvis:self-repair:manual:pending'\)/);
  assert.match(view, /developerRepair\?\.getPending\?\.\(\)/);
});

test('Accept validates the exact plan locally, restores staging, then publishes only the validated bytes to GitHub', () => {
  const start = main.indexOf("ipcMain.handle('jarvis:self-repair:manual:apply'");
  const end = main.indexOf("ipcMain.handle('jarvis:repair:apply'",start);
  const body = main.slice(start,end);
  assert.ok(start >= 0 && end > start);
  const checks = [
    "loadPersistedManualRepairPlan(hash)",
    "if (!loadPersistedManualRepairPlan(hash)) throw new Error('MANUAL_REPAIR_PLAN_MUTATED')",
    "const expectedBaseFiles=developerRepair.readOwnerPlanFiles(",
    "developerRepair.snapshotOwner(",
    "developerRepair.applyOwner(",
    "developerRepair.normalizeOwnerPlanFiles(",
    "await validateDirectOwnerRepair(",
    "await ensureManualRuntimeBuilt(",
    "const stagedFiles=developerRepair.readOwnerPlanFiles(",
    "developerRepair.rollbackOwner(entry.workspace,backup)",
    "await client.createRepairPullRequest(",
    "writeGitHubRepairState(githubState)"
  ];
  let previous = -1;
  for (const item of checks) {
    const index = body.indexOf(item);
    assert.ok(index > previous, `Approval or GitHub handoff sequence incorrect: ${item}`);
    previous = index;
  }
  assert.doesNotMatch(body, /requireOwnerPresence/);
  assert.doesNotMatch(body, /scheduleManualRuntimeRestart\(/);
  assert.match(body, /fs\.rmSync\(manualRuntimeStatePath\(\),\{force:true\}\)/);
  assert.match(body, /stagingOnly:true/);
});

test('staging runtime is written only after source checks, node tests and build', () => {
  const start = main.indexOf('async function ensureManualRuntimeBuilt(');
  const end = main.indexOf('function scheduleManualRuntimeRestart(',start);
  const body = main.slice(start,end);
  assert.ok(start >= 0 && end > start);
  for (const step of [
    "await checkNpm('lint')",
    "await checkNpm('typecheck')",
    "await checkNpm('verify:jarvis')",
    "await runToolchainNode(['--test',...testFiles]",
    "await checkNpm('build')",
    "writeJson(manualRuntimeStatePath(),state)"
  ]) assert.ok(body.includes(step),step);
  assert.ok(body.indexOf("await checkNpm('build')") < body.indexOf('writeJson(manualRuntimeStatePath(),state)'));
});

test('owner repair backup restores bytes when a patch is rejected or build fails', (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-safe-repair-'));
  const backups = fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-safe-backup-'));
  t.after(() => {
    fs.rmSync(workspace,{recursive:true,force:true});
    fs.rmSync(backups,{recursive:true,force:true});
  });
  fs.writeFileSync(path.join(workspace,'package.json'),JSON.stringify({name:'jarvis-desktop'}));
  const file = path.join(workspace,'src','pages','sample.js');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,'export const state = "known-good";\n');

  const plan = repair.validateOwnerPlan(workspace,{
    goal:'restore test',rationale:'a reversible example',risk:'low',
    patches:[{file:'src/pages/sample.js',replacements:[
      {search:'"known-good"',replace:'"patched"'}
    ]}]
  });
  assert.match(plan.hash,/^[a-f0-9]{64}$/);
  const backup = repair.snapshotOwner(workspace,plan,backups);
  repair.applyOwner(workspace,plan);
  assert.equal(fs.readFileSync(file,'utf8'),'export const state = "patched";\n');
  repair.rollbackOwner(workspace,backup);
  assert.equal(fs.readFileSync(file,'utf8'),'export const state = "known-good";\n');
});
