import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const main = fs.readFileSync('electron/main.cjs','utf8');
const hash = 'a'.repeat(64);

function makeApplyHarness(overrides={}) {
  const events=[];
  let applyHandler=null;
  let patched=false;
  let state=null;
  const entry={
    createdAt:Date.now(),
    workspace:'/safe/source',
    plan:{hash,goal:'test repair',risk:'low',rationale:'test',patches:[{file:'src/pages/example.jsx'}]}
  };

  const githubClient = overrides.githubClient || {
    createRepairPullRequest:async(input)=>{
      events.push('github-publish');
      assert.equal(input.hash,hash);
      assert.equal(input.files[0].content,'fixed');
      assert.equal(input.expectedBaseFiles[0].content,'old');
      return {
        repo:'bigzsorzs-sketch/jarvis-windows-v0.1',
        baseSha:'1'.repeat(40),
        branch:'fix/jarvis-self-repair-v0-3-24-aaaaaaaaaa',
        headSha:'2'.repeat(40),
        version:'0.3.24',
        prNumber:41,
        prUrl:'https://github.com/example/pr/41'
      };
    }
  };

  const repair={
    proposalHash:()=>hash,
    readOwnerPlanFiles:()=>[{path:'src/pages/example.jsx',content:patched?'fixed':'old'}],
    snapshotOwner:()=>{events.push('backup');return '/backup/test';},
    applyOwner:()=>{patched=true;events.push('apply');},
    normalizeOwnerPlanFiles:()=>events.push('canonicalize'),
    rollbackOwner:()=>{patched=false;events.push('rollback');}
  };
  const context={
    ipcMain:{handle:(name,callback)=>{if(name==='jarvis:self-repair:manual:apply')applyHandler=callback;}},
    localOwnerAuthorised:()=>true,
    loadPersistedManualRepairPlan:()=>entry,
    manualRepairPlans:new Map(),
    removePersistedManualRepairPlan:()=>events.push('remove-plan'),
    developerRepair:repair,
    developerBackupRoot:()=>'/backup',
    selfRepairToolchainPaths:()=>null,
    selfRepairSourceFingerprint:()=> 'workspace-clean',
    manualRuntimeStatePath:()=>'/runtime.json',
    fs:{rmSync:()=>events.push('invalidate'),existsSync:()=>false},
    validateDirectOwnerRepair:async()=>({ok:true,results:[{cmd:'node --check',ok:true}]}),
    ensureManualRuntimeBuilt:async()=>({checks:[{cmd:'npm run build',ok:true}],version:'0.3.24',builtAt:'now'}),
    selfRepairLearning:{recordVerified:()=>events.push('learn')},
    activation:{
      snapshotRuntime:()=>{events.push('snapshot-runtime');return '/backup/runtime';},
      restoreRuntime:()=>events.push('restore-runtime')
    },
    getGitHubSelfRepairClient:()=>githubClient,
    readGitHubRepairState:()=>null,
    githubSelfRepair:{DEFAULT_REPO:'bigzsorzs-sketch/jarvis-windows-v0.1'},
    app:{getVersion:()=> '0.3.23'},
    writeGitHubRepairState:(value)=>{state=value;events.push('github-state');return value;},
    Date,console
  };
  Object.assign(context,overrides);
  const from = main.indexOf("ipcMain.handle('jarvis:self-repair:manual:apply'");
  const to = main.indexOf("ipcMain.handle('jarvis:repair:apply'",from);
  assert.ok(from>=0&&to>from,'Self-Repair IPC handler not found');
  vm.runInNewContext('let manualRepairApplyInFlight = false; let manualRepairRequestEpoch = 0;\n'+main.slice(from,to),context);
  assert.equal(typeof applyHandler,'function');
  return {apply:applyHandler,events,entry,context,get state(){return state;},get patched(){return patched;}};
}

test('unauthorised local user cannot apply a pending repair',async()=>{
  const h=makeApplyHarness({localOwnerAuthorised:()=>false});
  await assert.rejects(()=>h.apply(null,{hash}),/MANUAL_REPAIR_UNAUTHORISED/);
  assert.equal(h.events.includes('backup'),false);
  assert.equal(h.events.includes('apply'),false);
  assert.equal(h.events.includes('github-publish'),false);
});

test('an active GitHub repair blocks a second repair before local source mutation',async()=>{
  const h=makeApplyHarness({
    readGitHubRepairState:()=>({phase:'pull-request',prNumber:41})
  });
  await assert.rejects(()=>h.apply(null,{hash}),/GITHUB_REPAIR_ALREADY_ACTIVE/);
  assert.equal(h.events.includes('backup'),false);
  assert.equal(h.events.includes('apply'),false);
});

test('missing GitHub connection aborts before any local source change',async()=>{
  const h=makeApplyHarness({getGitHubSelfRepairClient:()=>{throw new Error('GITHUB_TOKEN_MISSING');}});
  await assert.rejects(()=>h.apply(null,{hash}),/GITHUB_TOKEN_MISSING/);
  assert.equal(h.events.includes('backup'),false);
  assert.equal(h.events.includes('apply'),false);
});

test('Accept validates the exact patch locally, restores staging, then creates a GitHub PR without restarting local Jarvis',async()=>{
  const h=makeApplyHarness();
  const result=await h.apply(null,{hash});
  assert.equal(result.success,true);
  assert.equal(result.status,'GITHUB_PR_OPENED');
  assert.equal(result.github.prNumber,41);
  assert.equal(result.runtime.stagingOnly,true);
  assert.equal(result.runtime.restartScheduled,false);
  assert.equal(h.events.includes('apply'),true);
  assert.equal(h.events.includes('canonicalize'),true);
  assert.equal(h.events.includes('github-publish'),true);
  assert.equal(h.events.includes('github-state'),true);
  assert.equal(h.patched,false);
  assert.ok(h.events.indexOf('apply') < h.events.indexOf('canonicalize'));
  assert.ok(h.events.indexOf('canonicalize') < h.events.indexOf('rollback'));
  assert.ok(h.events.indexOf('rollback') < h.events.indexOf('github-publish'));
  assert.equal(h.state.prNumber,41);
});

test('simultaneous IPC apply requests cannot publish the same plan twice',async()=>{
  let release;
  const waiting=new Promise(resolve=>{release=resolve;});
  let publishes=0;
  const h=makeApplyHarness({
    githubClient:{
      createRepairPullRequest:async()=>{
        publishes+=1;
        await waiting;
        return {
          repo:'bigzsorzs-sketch/jarvis-windows-v0.1',
          baseSha:'1'.repeat(40),
          branch:'fix/jarvis-self-repair-v0-3-24-aaaaaaaaaa',
          headSha:'2'.repeat(40),
          version:'0.3.24',
          prNumber:41,
          prUrl:'https://github.com/example/pr/41'
        };
      }
    }
  });
  const first=h.apply(null,{hash});
  await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(()=>h.apply(null,{hash}),/MANUAL_REPAIR_ALREADY_IN_PROGRESS/);
  release();
  const result=await first;
  assert.equal(result.success,true);
  assert.equal(publishes,1);
});

test('failed direct source validation restores staging without GitHub mutation or runtime activation',async()=>{
  const h=makeApplyHarness({
    validateDirectOwnerRepair:async()=>({ok:false,results:[{cmd:'syntax',ok:false}]})
  });
  const result=await h.apply(null,{hash});
  assert.equal(result.success,false);
  assert.equal(result.status,'ROLLED_BACK');
  assert.ok(h.events.includes('rollback'));
  assert.equal(h.events.includes('restore-runtime'),false);
  assert.equal(h.events.includes('github-publish'),false);
  assert.equal(h.patched,false);
});

test('unexpected staging source mutation outside the approved patch aborts before GitHub and invalidates the staging workspace',async()=>{
  let fingerprintCalls=0;
  const h=makeApplyHarness({
    selfRepairSourceFingerprint:()=>{
      fingerprintCalls+=1;
      return fingerprintCalls===1 ? 'workspace-clean' : 'workspace-dirty';
    }
  });
  await assert.rejects(()=>h.apply(null,{hash}),/MANUAL_REPAIR_STAGING_INTEGRITY_FAILED/);
  assert.equal(h.events.includes('github-publish'),false);
  assert.equal(h.events.includes('remove-plan'),true);
  assert.ok(fingerprintCalls>=2);
});

test('failed toolchain build restores staging and never activates or publishes it',async()=>{
  const h=makeApplyHarness({
    ensureManualRuntimeBuilt:async()=>{throw new Error('BUILD_FAILED');}
  });
  await assert.rejects(()=>h.apply(null,{hash}),/BUILD_FAILED/);
  assert.ok(h.events.includes('rollback'));
  assert.equal(h.events.includes('restore-runtime'),false);
  assert.equal(h.events.includes('github-publish'),false);
  assert.equal(h.patched,false);
});

test('rollback failure is reported instead of silently hiding staging corruption',async()=>{
  const h=makeApplyHarness({
    ensureManualRuntimeBuilt:async()=>{throw new Error('BUILD_FAILED');}
  });
  h.context.developerRepair.rollbackOwner=()=>{throw new Error('DISK_ERROR');};
  await assert.rejects(()=>h.apply(null,{hash}),/MANUAL_REPAIR_ROLLBACK_FAILED: DISK_ERROR/);
  assert.equal(h.events.includes('github-publish'),false);
});

test('GitHub PR state persistence failure keeps the validated pending plan so the exact existing PR can be recovered on retry',async()=>{
  const h=makeApplyHarness({
    writeGitHubRepairState:()=>{throw new Error('DISK_FULL');}
  });
  await assert.rejects(()=>h.apply(null,{hash}),/GITHUB_REPAIR_STATE_PERSIST_FAILED: DISK_FULL/);
  assert.equal(h.patched,false);
  assert.equal(h.events.includes('github-publish'),true);
  assert.equal(h.events.includes('remove-plan'),false);
});

test('GitHub failure after full local validation keeps the still-valid pending plan for retry and leaves staging restored',async()=>{
  const h=makeApplyHarness({
    githubClient:{createRepairPullRequest:async()=>{throw new Error('GITHUB_API_503: unavailable');}}
  });
  await assert.rejects(()=>h.apply(null,{hash}),/GITHUB_API_503/);
  assert.equal(h.patched,false);
  assert.equal(h.events.includes('rollback'),true);
  assert.equal(h.events.includes('remove-plan'),false);
});

test('successful apply reports direct and full-build validation and stores immutable GitHub repair state',async()=>{
  const h=makeApplyHarness();
  const result=await h.apply(null,{hash});
  assert.equal(result.validation.ok,true);
  assert.equal(result.validation.results.length,2);
  assert.equal(result.github.headSha,'2'.repeat(40));
  assert.equal(result.github.version,'0.3.24');
  assert.equal(h.state.repairHash,hash);
  assert.equal(h.state.phase,'pull-request');
});

test('manual GitHub Self-Repair apply path never activates the staging runtime directly',()=>{
  const from=main.indexOf("ipcMain.handle('jarvis:self-repair:manual:apply'");
  const to=main.indexOf("ipcMain.handle('jarvis:repair:apply'",from);
  const body=main.slice(from,to);
  assert.doesNotMatch(body,/scheduleManualRuntimeRestart\(/);
  assert.match(body,/developerRepair\.rollbackOwner\(entry\.workspace,backup\)/);
  assert.match(body,/createRepairPullRequest/);
});
