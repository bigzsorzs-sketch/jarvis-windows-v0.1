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

function applyBody(){
  const start=main.indexOf("ipcMain.handle('jarvis:self-repair:manual:apply'");
  const end=main.indexOf("ipcMain.handle('jarvis:repair:apply'",start);
  assert.ok(start>=0 && end>start);
  return main.slice(start,end);
}

test('only one Self-Repair apply can run and chat cannot invalidate it mid-flight', () => {
  assert.match(main,/let manualRepairApplyInFlight = false/);
  assert.match(main,/async function selfRepairChat\(payload=\{\}\) \{\s*if \(manualRepairApplyInFlight\) throw new Error\('MANUAL_REPAIR_ALREADY_IN_PROGRESS'\)/);
  const body=applyBody();
  assert.match(body,/manualRepairApplyInFlight = true/);
  assert.match(body,/finally \{\s*manualRepairApplyInFlight = false;\s*\}/);
});

test('new Self-Repair request invalidates old proposals in both layers', () => {
  assert.match(main,/async function selfRepairChat\([\s\S]*?clearPendingManualRepairPlans\(\)/);
  assert.match(view,/pendingRequestEpoch\.current \+= 1;\s*setPendingRepair\(null\)/);
  assert.match(view,/disabled=\{manualApplyBusy \|\| chatBusy \|\| !pendingRepair\?\.hash\}/);
});

test('pending approval is exact-workspace-bound and expires', () => {
  assert.match(main,/workspaceSourceFingerprint:selfRepairSourceFingerprint\(entry\.workspace\)/);
  assert.match(main,/saved\.workspaceSourceFingerprint !== selfRepairSourceFingerprint\(manualRepairWorkspaceRoot\(\)\)/);
  assert.match(main,/Date\.now\(\) - Number\(saved\.createdAt \|\| 0\) > 60 \* 60 \* 1000/);
  assert.match(preload,/getPending: \(\) => ipcRenderer\.invoke\('jarvis:self-repair:manual:pending'\)/);
});

test('Accept follows exact hash confirmation backup validation activation and restart order', () => {
  const body=applyBody();
  const sequence=[
    'loadPersistedManualRepairPlan(hash)',
    'developerRepair.proposalHash(approvedPlan)!==hash',
    'await requireOwnerPresence',
    "if (!loadPersistedManualRepairPlan(hash)) throw new Error('MANUAL_REPAIR_PLAN_MUTATED')",
    'developerRepair.snapshotOwner',
    'developerRepair.applyOwner',
    'developerRepair.normalizeOwnerPlanFiles',
    'await validateDirectOwnerRepair',
    'await ensureManualRuntimeBuilt',
    'scheduleManualRuntimeRestart(entry.workspace)'
  ];
  let previous=-1;
  for(const item of sequence){
    const index=body.indexOf(item,previous+1);
    assert.ok(index>previous,item);
    previous=index;
  }
  assert.match(body,/status:'APPLIED_AND_RESTARTING'/);
  assert.doesNotMatch(body,/GitHub|createRepairPullRequest|GITHUB_PR_OPENED/);
});

test('full local gate activates only after all required validation commands', () => {
  const start=main.indexOf('async function ensureManualRuntimeBuilt(');
  const end=main.indexOf('function clearLegacyManualRuntimeState(',start);
  const body=main.slice(start,end);
  assert.ok(start>=0 && end>start);
  for(const step of [
    "runToolchainNpm(['ci','--no-audit','--no-fund']",
    "runToolchainNpm(['audit','--omit=dev','--audit-level=moderate']",
    "runToolchainNode(['scripts/audit-all-source.cjs']",
    "await checkNpm('lint')",
    "await checkNpm('typecheck')",
    "await checkNpm('verify:jarvis')",
    "await runToolchainNode(['--test',...testFiles]",
    "await checkNpm('build')",
    'enabled:true',
    'writeJson(manualRuntimeStatePath(),state)'
  ]) assert.ok(body.includes(step),step);
  assert.ok(body.indexOf("await checkNpm('build')") < body.indexOf('writeJson(manualRuntimeStatePath(),state)'));
});

test('failed validation clears activation and rolls workspace back', () => {
  const body=applyBody();
  assert.match(body,/if \(!validation\.ok\) \{[\s\S]*developerRepair\.rollbackOwner\(entry\.workspace,backup\)/);
  assert.match(body,/fs\.rmSync\(manualRuntimeStatePath\(\),\{force:true\}\)/);
  assert.match(body,/MANUAL_REPAIR_ROLLBACK_FAILED/);
});

test('owner repair backup restores exact original bytes', (t) => {
  const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-safe-repair-'));
  const backups=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-safe-backup-'));
  t.after(()=>{fs.rmSync(workspace,{recursive:true,force:true});fs.rmSync(backups,{recursive:true,force:true});});
  fs.writeFileSync(path.join(workspace,'package.json'),JSON.stringify({name:'jarvis-desktop'}));
  const file=path.join(workspace,'src','pages','sample.js');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,'export const state = "known-good";\n');
  const plan=repair.validateOwnerPlan(workspace,{goal:'restore test',risk:'low',patches:[{file:'src/pages/sample.js',replacements:[{search:'"known-good"',replace:'"patched"'}]}]});
  const backup=repair.snapshotOwner(workspace,plan,backups);
  repair.applyOwner(workspace,plan);
  repair.rollbackOwner(workspace,backup);
  assert.equal(fs.readFileSync(file,'utf8'),'export const state = "known-good";\n');
});
