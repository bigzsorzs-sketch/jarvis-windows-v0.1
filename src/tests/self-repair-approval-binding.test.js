import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const github = require('../../electron/github-self-repair.cjs');
const expected = '1'.repeat(40);
const changed = '2'.repeat(40);
const base = '3'.repeat(40);
const merge = '4'.repeat(40);
const branch = 'fix/jarvis-self-repair-v0-3-26-approved';
const repo = github.DEFAULT_REPO;
const response = value => ({ok:true,status:200,text:async()=>JSON.stringify(value)});

function clientHarness(patch = {}) {
  let mutations = 0;
  const pr = {
    number:44,state:'closed',merged:true,merge_commit_sha:merge,
    base:{ref:'main',repo:{full_name:repo}},
    head:{ref:branch,sha:expected,repo:{full_name:repo}},
    ...patch,
  };
  const client = github.createGitHubSelfRepairClient({
    token:'github_pat_'+'x'.repeat(40),
    fetchImpl:async(url,options={})=>{
      if (options.method && options.method !== 'GET') mutations += 1;
      const path = new URL(url).pathname;
      if (path.endsWith('/pulls/44')) return response(pr);
      if (path.endsWith('/actions/runs')) return response({workflow_runs:[{
        id:123,name:github.WORKFLOW_NAME,head_sha:pr.head.sha,head_branch:pr.head.ref,
        event:'push',status:'completed',conclusion:'success',run_number:1,
      }]});
      if (path.endsWith('/actions/runs/123/jobs')) return response({jobs:[
        {id:1,name:'CodeQL security scan',status:'completed',conclusion:'success'},
        {id:2,name:'windows-installer',status:'completed',conclusion:'success'},
      ]});
      throw new Error('Unexpected request: '+path);
    },
  });
  return {client,get mutations(){return mutations;}};
}

test('an externally merged PR with a changed head cannot satisfy the stored approval',async()=>{
  const h=clientHarness({head:{ref:branch,sha:changed,repo:{full_name:repo}}});
  await assert.rejects(()=>h.client.mergeRepair(44,expected,base),/GITHUB_REPAIR_HEAD_CHANGED/);
  assert.equal(h.mutations,0);
});

test('the approved already merged head remains idempotent',async()=>{
  const h=clientHarness();
  const result=await h.client.mergeRepair(44,expected,base);
  assert.equal(result.alreadyMerged,true);
  assert.equal(result.mergeSha,merge);
  assert.equal(result.status.repo,repo);
  assert.equal(h.mutations,0);
});

test('self-repair PR status validates repository, branch, base and number before proceeding',async()=>{
  for (const patch of [
    {number:45},
    {base:{ref:'main',repo:{full_name:'other/repo'}}},
    {head:{ref:branch,sha:expected,repo:{full_name:'other/repo'}}},
    {base:{ref:'develop',repo:{full_name:repo}}},
    {head:{ref:'feature/unapproved',sha:expected,repo:{full_name:repo}}},
    {head:{ref:branch,sha:expected}},
  ]) {
    const h=clientHarness(patch);
    await assert.rejects(()=>h.client.getPullRequestStatus(44),/GITHUB_PR_NOT_SELF_REPAIR/);
    assert.equal(h.mutations,0);
  }
});

function stateHarness(storedPatch = {}, remotePatch = {}) {
  const stored={phase:'pull-request',prNumber:44,version:'0.3.26',repo,branch,
    headSha:expected,baseSha:base,...storedPatch};
  const remote={prNumber:44,repo,branch,headSha:expected,merged:true,mergeCommitSha:merge,...remotePatch};
  const source=fs.readFileSync('electron/main.cjs','utf8');
  const start=source.indexOf('async function syncGitHubRepairState(');
  const end=source.indexOf('async function getGitHubSelfRepairStatus(',start);
  let persisted=null;
  let mainChecks=0;
  const sync=vm.runInNewContext(source.slice(start,end)+';syncGitHubRepairState',{
    githubSelfRepair:github,Date,
    readGitHubRepairState:()=>structuredClone(stored),
    writeGitHubRepairState:value=>{persisted=value;},
    getGitHubSelfRepairClient:()=>({
      getPullRequestStatus:async()=>remote,
      getMainStatus:async()=>{mainChecks+=1;return {state:'current',ci:{state:'passed'}};},
      getReleaseStatus:async()=>({state:'released'}),
    }),
  });
  return {sync,get persisted(){return persisted;},get mainChecks(){return mainChecks;}};
}

test('status refresh rejects changed PR identities and never adopts their merge SHA',async()=>{
  for (const patch of [{headSha:changed},{branch:'fix/jarvis-self-repair-other'},{repo:'other/repo'},{prNumber:45}]) {
    const h=stateHarness({},patch);
    await assert.rejects(h.sync,/GITHUB_REPAIR_HEAD_CHANGED|GITHUB_REPAIR_PR_IDENTITY_CHANGED/);
    assert.equal(h.persisted,null);
    assert.equal(h.mainChecks,0);
  }
});

test('already verified state is rechecked and cannot release a subsequently changed PR',async()=>{
  const h=stateHarness({phase:'main-verified',mergeSha:merge},{headSha:changed});
  await assert.rejects(h.sync,/GITHUB_REPAIR_HEAD_CHANGED/);
  assert.equal(h.persisted,null);
  const changedMerge=stateHarness({phase:'main-verified',mergeSha:merge},{mergeCommitSha:'5'.repeat(40)});
  await assert.rejects(changedMerge.sync,/GITHUB_REPAIR_MERGE_CHANGED/);
});

test('matching external merge can be verified while dispatched and released phases are retained',async()=>{
  const h=stateHarness();
  assert.equal((await h.sync()).phase,'main-verified');
  assert.equal(h.persisted.headSha,expected);
  for (const phase of ['main-verified','release-dispatched','released']) {
    const next=stateHarness({phase,mergeSha:merge});
    assert.equal((await next.sync()).phase,phase);
  }
});
