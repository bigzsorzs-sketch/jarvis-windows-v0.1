import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main=fs.readFileSync('electron/main.cjs','utf8');
const preload=fs.readFileSync('electron/preload.cjs','utf8');
const system=fs.readFileSync('src/pages/SystemCenter.jsx','utf8');

function applyBody(){
  const from=main.indexOf("ipcMain.handle('jarvis:self-repair:manual:apply'");
  const to=main.indexOf("ipcMain.handle('jarvis:repair:apply'",from);
  assert.ok(from>=0 && to>from,'Self-Repair IPC handler not found');
  return main.slice(from,to);
}

test('renderer exposes only pending and apply operations for manual Self-Repair',()=>{
  assert.match(preload,/getPending: \(\) => ipcRenderer\.invoke\('jarvis:self-repair:manual:pending'\)/);
  assert.match(preload,/applyPending: \(hash\) => ipcRenderer\.invoke\('jarvis:self-repair:manual:apply', \{ hash \}\)/);
  assert.doesNotMatch(preload,/self-repair:github|github:\s*\{/);
});

test('manual apply is owner-authorized and bound to exact persisted hash',()=>{
  const body=applyBody();
  assert.match(body,/if \(!localOwnerAuthorised\(\)\) throw new Error\('MANUAL_REPAIR_UNAUTHORISED'\)/);
  assert.match(body,/const hash=String\(request\.hash \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(body,/developerRepair\.proposalHash\(approvedPlan\)!==hash/);
  assert.match(body,/MANUAL_REPAIR_PLAN_MUTATED/);
  assert.match(body,/Date\.now\(\)-entry\.createdAt > 60\*60\*1000/);
});

test('native owner presence is required before source mutation',()=>{
  const body=applyBody();
  const confirm=body.indexOf('await requireOwnerPresence');
  const backup=body.indexOf('developerRepair.snapshotOwner');
  const apply=body.indexOf('developerRepair.applyOwner');
  assert.ok(confirm>=0 && backup>confirm && apply>backup);
});

test('successful Accept validates then activates and restarts locally',()=>{
  const body=applyBody();
  const direct=body.indexOf('await validateDirectOwnerRepair');
  const build=body.indexOf('await ensureManualRuntimeBuilt');
  const restart=body.indexOf('scheduleManualRuntimeRestart(entry.workspace)');
  assert.ok(direct>=0 && build>direct && restart>build);
  assert.match(body,/status:'APPLIED_AND_RESTARTING'/);
  assert.match(body,/restartScheduled:true/);
  assert.match(body,/local:true/);
  assert.doesNotMatch(body,/GitHub|createRepairPullRequest|GITHUB_PR_OPENED/);
});

test('failed direct validation rolls back before returning failure',()=>{
  const body=applyBody();
  const failure=body.indexOf('if (!validation.ok)');
  const rollback=body.indexOf('developerRepair.rollbackOwner(entry.workspace,backup)',failure);
  const result=body.indexOf("status:'ROLLED_BACK'",failure);
  assert.ok(failure>=0 && rollback>failure && result>rollback);
  assert.match(body,/MANUAL_REPAIR_STAGING_INTEGRITY_FAILED/);
});

test('unexpected errors clear activation and attempt rollback',()=>{
  const body=applyBody();
  assert.match(body,/catch \(error\) \{[\s\S]*fs\.rmSync\(manualRuntimeStatePath\(\),\{force:true\}\)/);
  assert.match(body,/MANUAL_REPAIR_ROLLBACK_FAILED/);
});

test('System Center reports local restart instead of remote publication',()=>{
  assert.match(system,/APPLIED_AND_RESTARTING/);
  assert.match(system,/javított helyi runtime-mal újraindul/);
  assert.doesNotMatch(system,/GitHub Self-Repair|GitHub PR|GITHUB_PR_OPENED|Pull Request/);
});
