import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const main = fs.readFileSync('electron/main.cjs','utf8');
const hash = 'a'.repeat(64);

function makeApplyHarness(overrides={}) {
  const events=[];
  let applyHandler=null;
  const entry={
    createdAt:Date.now(),
    workspace:'/safe/source',
    plan:{hash,goal:'test repair',risk:'low',rationale:'test',patches:[{file:'src/pages/example.jsx'}]}
  };
  const repair={
    proposalHash:()=>hash,
    snapshotOwner:()=>{events.push('backup');return '/backup/test';},
    applyOwner:()=>events.push('apply'),
    rollbackOwner:()=>events.push('rollback')
  };
  const context={
    ipcMain:{handle:(name,callback)=>{if(name==='jarvis:self-repair:manual:apply')applyHandler=callback;}},
    localOwnerAuthorised:()=>true,
    loadPersistedManualRepairPlan:()=>entry,
    manualRepairPlans:new Map(),
    removePersistedManualRepairPlan:()=>events.push('remove-plan'),
    requireOwnerPresence:async()=>{events.push('consent');},
    developerRepair:repair,
    developerBackupRoot:()=>'/backup',
    selfRepairToolchainPaths:()=>null,
    manualRuntimeStatePath:()=>'/runtime.json',
    fs:{rmSync:()=>events.push('invalidate'),existsSync:()=>false},
    validateDirectOwnerRepair:async()=>({ok:true,results:[{cmd:'node --check',ok:true}]}),
    ensureManualRuntimeBuilt:async()=>({checks:[{cmd:'npm run build',ok:true}],version:'0.3.20',builtAt:'now'}),
    selfRepairLearning:{recordVerified:()=>events.push('learn')},
    scheduleManualRuntimeRestart:()=>events.push('restart'),
    activation:{ snapshotRuntime:()=>{events.push('snapshot-runtime');return '/backup/runtime';}, restoreRuntime:()=>events.push('restore-runtime') },
    Date,console
  };
  Object.assign(context,overrides);
  const from = main.indexOf("ipcMain.handle('jarvis:self-repair:manual:apply'");
  const to = main.indexOf("ipcMain.handle('jarvis:repair:apply'",from);
  assert.ok(from>=0&&to>from,'Self-Repair IPC handler not found');
  vm.runInNewContext('let manualRepairApplyInFlight = false;\n'+main.slice(from,to),context);
  assert.equal(typeof applyHandler,'function');
  return {apply:applyHandler,events,entry,context};
}

test('unauthorised local user cannot apply a pending repair',async()=>{
  const h=makeApplyHarness({localOwnerAuthorised:()=>false});
  await assert.rejects(()=>h.apply(null,{hash}),/MANUAL_REPAIR_UNAUTHORISED/);
  assert.equal(h.events.includes('backup'),false);
  assert.equal(h.events.includes('apply'),false);
  assert.equal(h.events.includes('restart'),false);
});

test('Accept applies the exact pending plan without a second native consent step',async()=>{
  const h=makeApplyHarness();
  const result=await h.apply(null,{hash});
  assert.equal(result.success,true);
  assert.equal(h.events.includes('consent'),false);
  assert.equal(h.events.includes('apply'),true);
  assert.equal(h.events.includes('restart'),true);
});

test('simultaneous IPC apply requests cannot write the same plan twice',async()=>{
  let release;
  const waiting=new Promise(resolve=>{release=resolve;});
  const h=makeApplyHarness({requireOwnerPresence:()=>waiting});
  const first=h.apply(null,{hash});
  await assert.rejects(()=>h.apply(null,{hash}),/MANUAL_REPAIR_ALREADY_IN_PROGRESS/);
  release();
  const result=await first;
  assert.equal(result.success,true);
  assert.equal(h.events.filter(x=>x==='apply').length,1);
  assert.equal(h.events.filter(x=>x==='restart').length,1);
});

test('failed source validation rolls back without restarting',async()=>{
  const h=makeApplyHarness({
    validateDirectOwnerRepair:async()=>({ok:false,results:[{cmd:'syntax',ok:false}]})
  });
  const result=await h.apply(null,{hash});
  assert.equal(result.success,false);
  assert.equal(result.status,'ROLLED_BACK');
  assert.ok(h.events.includes('rollback'));
  assert.ok(h.events.includes('restore-runtime'));
  assert.equal(h.events.includes('restart'),false);
});

test('failed toolchain build rolls back source and restores the previous runtime',async()=>{
  const h=makeApplyHarness({
    ensureManualRuntimeBuilt:async()=>{throw new Error('BUILD_FAILED');}
  });
  await assert.rejects(()=>h.apply(null,{hash}),/BUILD_FAILED/);
  assert.ok(h.events.includes('rollback'));
  assert.ok(h.events.includes('restore-runtime'));
  assert.ok(h.events.filter(x=>x==='invalidate').length>=2);
  assert.equal(h.events.includes('restart'),false);
});

test('rollback failure is reported instead of silently hiding data corruption',async()=>{
  const h=makeApplyHarness({
    ensureManualRuntimeBuilt:async()=>{throw new Error('BUILD_FAILED');}
  });
  h.context.developerRepair.rollbackOwner=()=>{throw new Error('DISK_ERROR');};
  await assert.rejects(()=>h.apply(null,{hash}),/MANUAL_REPAIR_ROLLBACK_FAILED: DISK_ERROR/);
  assert.equal(h.events.includes('restart'),false);
});

test('successful apply reports both validation stages and schedules restart once',async()=>{
  const h=makeApplyHarness();
  const result=await h.apply(null,{hash});
  assert.equal(result.status,'APPLIED_AND_RESTARTING');
  assert.equal(result.validation.ok,true);
  assert.equal(result.validation.results.length,2);
  assert.ok(h.events.indexOf('backup')<h.events.indexOf('apply'));
  assert.ok(h.events.indexOf('apply')<h.events.indexOf('restart'));
  assert.equal(h.events.filter(x=>x==='restart').length,1);
});

test('a thrown relaunch invalidates the pending runtime so it cannot loop on next startup',()=>{
  const from=main.indexOf('function scheduleManualRuntimeRestart(');
  const to=main.indexOf('function handOffToManualRuntimeIfReady(',from);
  assert.ok(from>=0&&to>from);
  let invalidated=0,crashes=0;
  const context={
    readManualRuntimeState:()=>({electronPath:'/fake/electron.exe'}),
    manualRuntimeElectronPath:()=>'/fake/electron.exe',
    selfRepairToolchainPaths:()=>null,
    manualRuntimeStatePath:()=>'/runtime.json',
    fs:{rmSync:()=>{invalidated++;}},
    app:{relaunch:()=>{throw new Error('NO_EXECUTABLE');},exit:()=>{throw new Error('MUST_NOT_EXIT');}},
    setTimeout:(fn)=>fn(),
    recordCrash:()=>{crashes++;},
    console
  };
  const restart=vm.runInNewContext(main.slice(from,to)+'; scheduleManualRuntimeRestart',context);
  restart('/safe/source');
  assert.equal(invalidated,1);
  assert.equal(crashes,1);
});
