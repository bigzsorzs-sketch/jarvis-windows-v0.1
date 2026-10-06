import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const github = require('../../electron/github-self-repair.cjs');
const electronMainSource = fs.readFileSync('electron/main.cjs','utf8');

function reply(status,payload) {
  return {
    ok:status >= 200 && status < 300,
    status,
    async text() { return payload === null || payload === undefined ? '' : JSON.stringify(payload); }
  };
}
function gitSha(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}
function b64(value) {
  return Buffer.from(String(value),'utf8').toString('base64');
}

test('GitHub release version helpers are strict and deterministic', () => {
  assert.equal(github.nextPatchVersion('0.3.23'),'0.3.24');
  assert.equal(github.nextPatchVersion('1.9.99'),'1.9.100');
  assert.throws(()=>github.nextPatchVersion('v0.3.23'),/GITHUB_RELEASE_VERSION_INVALID/);
  const source = "export const APP_VERSION = '0.3.23';\nexport const X = 1;\n";
  assert.equal(github.parseAppVersion(source),'0.3.23');
  assert.match(github.replaceAppVersion(source,'0.3.24'),/APP_VERSION = '0\.3\.24'/);
});

test('CI is passed only when both named gates and the exact workflow run succeeded', () => {
  const passed = github.summarizeChecks([
    {id:1,name:'CodeQL security scan',status:'completed',conclusion:'success'},
    {id:2,name:'windows-installer',status:'completed',conclusion:'success'}
  ]);
  assert.equal(github.deriveCiState(passed,{status:'completed',conclusion:'success'}),'passed');

  const missing = github.summarizeChecks([
    {id:1,name:'CodeQL security scan',status:'completed',conclusion:'success'}
  ]);
  assert.notEqual(github.deriveCiState(missing,{status:'completed',conclusion:'success'}),'passed');

  const failed = github.summarizeChecks([
    {id:1,name:'CodeQL security scan',status:'completed',conclusion:'success'},
    {id:2,name:'windows-installer',status:'completed',conclusion:'failure'}
  ]);
  assert.equal(github.deriveCiState(failed,{status:'completed',conclusion:'failure'}),'failed');
});

test('GitHub client rejects dot-segment and doubled-separator aliases before network mutation', async () => {
  const client=github.createGitHubSelfRepairClient({
    token:'github_pat_'+'p'.repeat(40),
    fetchImpl:async()=>{throw new Error('NETWORK_MUST_NOT_BE_CALLED');}
  });
  for (const file of [
    'src/./pages/SystemCenter.jsx',
    'src//pages/SystemCenter.jsx',
    'electron/./main.cjs',
    'electron//main.cjs',
    'src/pages/../pages/SystemCenter.jsx'
  ]) {
    await assert.rejects(()=>client.createRepairPullRequest({
      hash:'d'.repeat(64),goal:'deny path alias',
      files:[{path:file,content:'x'}],
      expectedBaseFiles:[{path:file,content:'y'}]
    }),/GITHUB_REPAIR_PATH_INVALID/,file);
  }
});

test('local owner plan rejects dot-segment aliases for protected files', () => {
  const os = require('node:os');
  const path = require('node:path');
  const repair = require('../../electron/developer-repair.cjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-dot-segment-'));
  try {
    fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'jarvis-desktop'}));
    for (const file of [
      'src/./pages/SystemCenter.jsx',
      'src//pages/SystemCenter.jsx',
      'electron/./main.cjs',
      'electron//main.cjs'
    ]) {
      assert.throws(()=>repair.validateOwnerPlan(root,{
        goal:'blocked alias',patches:[{file,content:'change'}]
      }),/DEV_REPAIR_INVALID_PATH/,file);
    }
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('Self-Repair GitHub client rejects protected repair paths before any write', async () => {
  let calls = 0;
  const client = github.createGitHubSelfRepairClient({
    token:'github_pat_' + 'a'.repeat(40),
    fetchImpl:async()=>{ calls += 1; return reply(500,{message:'must not be called'}); }
  });
  await assert.rejects(
    ()=>client.createRepairPullRequest({
      hash:'a'.repeat(64),
      goal:'bad',
      files:[{path:'.github/workflows/build-windows.yml',content:'x'}],
      expectedBaseFiles:[{path:'.github/workflows/build-windows.yml',content:'x'}]
    }),
    /GITHUB_REPAIR_PATH_BLOCKED/
  );
  assert.equal(calls,0);
});

function makeGitHubMock({drift=false, rogueDiff=false, badParent=false}={}) {
  const repo = github.DEFAULT_REPO;
  const baseSha = '1'.repeat(40);
  const baseTreeSha = '2'.repeat(40);
  const sourceFiles = new Map([
    ['src/pages/example.jsx','export const value = "old";\n'],
    ['package.json',JSON.stringify({name:'jarvis-desktop',version:'0.3.23'},null,2)+'\n'],
    ['package-lock.json',JSON.stringify({
      name:'jarvis-desktop',version:'0.3.23',lockfileVersion:3,packages:{'':{name:'jarvis-desktop',version:'0.3.23'}}
    },null,2)+'\n'],
    ['src/lib/appVersion.js',"export const APP_VERSION = '0.3.23';\n"]
  ]);
  if (drift) sourceFiles.set('src/pages/example.jsx','export const value = "remote-new";\n');

  const blobs = new Map();
  let branch = null;
  let branchSha = null;
  let branchFiles = null;
  const calls = [];

  async function fetchImpl(url,options={}) {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({method,path,search:parsed.search,body});

    if (method === 'GET' && path === `/repos/${repo}`) {
      return reply(200,{full_name:repo,owner:{login:'bigzsorzs-sketch'},default_branch:'main',private:false,permissions:{push:true}});
    }
    if (method === 'GET' && path === `/repos/${repo}/actions/workflows/build-windows.yml`) {
      return reply(200,{id:123,name:github.WORKFLOW_NAME});
    }
    if (method === 'GET' && path.includes('/git/ref/')) {
      const decoded = decodeURIComponent(path.split('/git/ref/')[1] || '');
      if (decoded === 'heads/main') return reply(200,{object:{sha:baseSha}});
      if (decoded.startsWith('heads/fix/jarvis-self-repair-')) {
        return branchSha ? reply(200,{object:{sha:branchSha}}) : reply(404,{message:'Not Found'});
      }
    }
    if (method === 'GET' && path === `/repos/${repo}/git/commits/${baseSha}`) {
      return reply(200,{sha:baseSha,tree:{sha:baseTreeSha}});
    }
    if (method === 'GET' && branchSha && path === `/repos/${repo}/git/commits/${branchSha}`) {
      return reply(200,{sha:branchSha,parents:[{sha:badParent ? '9'.repeat(40) : baseSha}]});
    }
    if (method === 'GET' && branchSha && path.startsWith(`/repos/${repo}/compare/`)) {
      const files=[...branchFiles.entries()]
        .filter(([name,content])=>sourceFiles.get(name)!==content)
        .map(([name])=>({filename:name,status:sourceFiles.has(name)?'modified':'added'}));
      if (rogueDiff) files.push({filename:'src/pages/unapproved-change.jsx',status:'added'});
      return reply(200,{status:'ahead',total_commits:1,files});
    }
    if (method === 'GET' && path.startsWith(`/repos/${repo}/contents/`)) {
      const file = path.split(`/repos/${repo}/contents/`)[1].split('/').map(decodeURIComponent).join('/');
      const ref = parsed.searchParams.get('ref');
      const value = ref && ref.startsWith('fix/jarvis-self-repair-')
        ? branchFiles?.get(file)
        : sourceFiles.get(file);
      if (value === undefined) return reply(404,{message:'Not Found'});
      return reply(200,{type:'file',encoding:'base64',content:b64(value)});
    }
    if (method === 'GET' && path === `/repos/${repo}/releases/latest`) {
      return reply(200,{tag_name:'v0.3.23',draft:false,prerelease:false});
    }
    if (method === 'GET' && path === `/repos/${repo}/releases/tags/v0.3.24`) {
      return reply(404,{message:'Not Found'});
    }
    if (method === 'POST' && path === `/repos/${repo}/git/blobs`) {
      const sha = gitSha(body.content + blobs.size);
      blobs.set(sha,body.content);
      return reply(201,{sha});
    }
    if (method === 'POST' && path === `/repos/${repo}/git/trees`) {
      branchFiles = new Map(sourceFiles);
      for (const entry of body.tree) branchFiles.set(entry.path,blobs.get(entry.sha));
      return reply(201,{sha:'3'.repeat(40)});
    }
    if (method === 'POST' && path === `/repos/${repo}/git/commits`) {
      branchSha = '4'.repeat(40);
      return reply(201,{sha:branchSha});
    }
    if (method === 'POST' && path === `/repos/${repo}/git/refs`) {
      branch = body.ref.replace(/^refs\/heads\//,'');
      return reply(201,{ref:body.ref,object:{sha:branchSha}});
    }
    if (method === 'POST' && path === `/repos/${repo}/pulls`) {
      return reply(201,{number:41,html_url:'https://github.com/example/pr/41',head:{ref:branch,sha:branchSha},base:{ref:'main'}});
    }
    if (method === 'GET' && path === `/repos/${repo}/pulls`) {
      return reply(200,branch ? [{
        number:41,state:'open',merged:false,html_url:'https://github.com/example/pr/41',
        head:{ref:branch,sha:branchSha},base:{ref:'main'},
        merge_commit_sha:'8'.repeat(40)
      }] : []);
    }
    if (method === 'DELETE' && path.includes('/git/refs/')) return reply(204,null);

    return reply(500,{message:`Unhandled ${method} ${path}`});
  }
  return {fetchImpl,calls,sourceFiles,get branchFiles(){return branchFiles;}};
}

test('GitHub repair transaction uploads the exact locally validated patch and deterministic next release metadata', async () => {
  const mock = makeGitHubMock();
  const client = github.createGitHubSelfRepairClient({
    token:'github_pat_' + 'b'.repeat(40),
    fetchImpl:mock.fetchImpl
  });
  const result = await client.createRepairPullRequest({
    hash:'b'.repeat(64),
    goal:'Fix example state',
    rationale:'Test repair',
    risk:'low',
    files:[{path:'src/pages/example.jsx',content:'export const value = "fixed";\n'}],
    expectedBaseFiles:[{path:'src/pages/example.jsx',content:'export const value = "old";\n'}],
    validation:[{cmd:'node --test',ok:true},{cmd:'npm run build',ok:true}],
    installedVersion:'0.3.23'
  });
  assert.equal(result.version,'0.3.24');
  assert.equal(result.prNumber,41);
  assert.match(result.branch,/^fix\/jarvis-self-repair-v0-3-24-/);
  assert.equal(mock.branchFiles.get('src/pages/example.jsx'),'export const value = "fixed";\n');
  assert.equal(JSON.parse(mock.branchFiles.get('package.json')).version,'0.3.24');
  assert.equal(JSON.parse(mock.branchFiles.get('package-lock.json')).version,'0.3.24');
  assert.match(mock.branchFiles.get('src/lib/appVersion.js'),/0\.3\.24/);
  assert.match(mock.branchFiles.get('release-notes/v0.3.24.md'),/Repair hash:/);
});

test('retry reuses only the exact previously approved repair diff with the same parent commit', async () => {
  const mock = makeGitHubMock();
  const client = github.createGitHubSelfRepairClient({
    token:'github_pat_'+'q'.repeat(40),fetchImpl:mock.fetchImpl
  });
  const input={
    hash:'a'.repeat(64),
    goal:'Exact retry',
    files:[{path:'src/pages/example.jsx',content:'export const value = "fixed";\n'}],
    expectedBaseFiles:[{path:'src/pages/example.jsx',content:'export const value = "old";\n'}],
    installedVersion:'0.3.23'
  };
  const first=await client.createRepairPullRequest(input);
  assert.equal(first.reused,false);
  const reused=await client.createRepairPullRequest(input);
  assert.equal(reused.reused,true);
  assert.equal(reused.headSha,first.headSha);
});

test('retry rejects a branch that added files outside the locally approved patch', async () => {
  const mock = makeGitHubMock({rogueDiff:true});
  const client = github.createGitHubSelfRepairClient({
    token:'github_pat_'+'q'.repeat(40),fetchImpl:mock.fetchImpl
  });
  const input={
    hash:'b'.repeat(64),
    goal:'Unapproved extra change',
    files:[{path:'src/pages/example.jsx',content:'export const value = "fixed";\n'}],
    expectedBaseFiles:[{path:'src/pages/example.jsx',content:'export const value = "old";\n'}],
    installedVersion:'0.3.23'
  };
  await client.createRepairPullRequest(input);
  await assert.rejects(()=>client.createRepairPullRequest(input),/GITHUB_REPAIR_BRANCH_DIFF_MISMATCH/);
});

test('retry rejects a repair branch rebased onto an unreviewed parent', async () => {
  const mock = makeGitHubMock({badParent:true});
  const client = github.createGitHubSelfRepairClient({
    token:'github_pat_'+'q'.repeat(40),fetchImpl:mock.fetchImpl
  });
  const input={
    hash:'c'.repeat(64),
    goal:'Unexpected parent',
    files:[{path:'src/pages/example.jsx',content:'export const value = "fixed";\n'}],
    expectedBaseFiles:[{path:'src/pages/example.jsx',content:'export const value = "old";\n'}],
    installedVersion:'0.3.23'
  };
  await client.createRepairPullRequest(input);
  await assert.rejects(()=>client.createRepairPullRequest(input),/GITHUB_REPAIR_BRANCH_BASE_CHANGED/);
});

test('GitHub repair transaction refuses to repair from an installed version older than main/latest release', async () => {
  const mock = makeGitHubMock();
  const client = github.createGitHubSelfRepairClient({
    token:'github_pat_' + 'd'.repeat(40),
    fetchImpl:mock.fetchImpl
  });
  await assert.rejects(
    ()=>client.createRepairPullRequest({
      hash:'d'.repeat(64),
      goal:'stale installed build',
      files:[{path:'src/pages/example.jsx',content:'export const value = "fixed";\n'}],
      expectedBaseFiles:[{path:'src/pages/example.jsx',content:'export const value = "old";\n'}],
      installedVersion:'0.3.22'
    }),
    /GITHUB_INSTALLED_VERSION_NOT_LATEST/
  );
});

test('GitHub repair transaction refuses to overwrite source when main changed after the local plan was created', async () => {
  const mock = makeGitHubMock({drift:true});
  const client = github.createGitHubSelfRepairClient({
    token:'github_pat_' + 'c'.repeat(40),
    fetchImpl:mock.fetchImpl
  });
  await assert.rejects(
    ()=>client.createRepairPullRequest({
      hash:'c'.repeat(64),
      goal:'Fix stale source',
      files:[{path:'src/pages/example.jsx',content:'export const value = "fixed";\n'}],
      expectedBaseFiles:[{path:'src/pages/example.jsx',content:'export const value = "old";\n'}],
      installedVersion:'0.3.23'
    }),
    /GITHUB_REPAIR_REMOTE_SOURCE_CHANGED/
  );
  assert.equal(mock.calls.some((call)=>call.method === 'POST'),false);
});


test('commit CI status is derived from the exact push workflow and its required jobs, not a generic green badge', async () => {
  const sha='9'.repeat(40);
  const branchName='fix/jarvis-self-repair-v0-3-24-deadbeef00';
  const client=github.createGitHubSelfRepairClient({
    token:'github_pat_'+'e'.repeat(40),
    fetchImpl:async(url)=>{
      const parsed=new URL(url);
      if (parsed.pathname.endsWith('/actions/runs')) {
        assert.equal(parsed.searchParams.get('head_sha'),sha);
        assert.equal(parsed.searchParams.get('branch'),branchName);
        return reply(200,{workflow_runs:[{
          id:77,name:github.WORKFLOW_NAME,head_sha:sha,head_branch:branchName,event:'push',
          run_number:12,status:'completed',conclusion:'success',html_url:'https://github.com/example/run/77'
        }]});
      }
      if (parsed.pathname.endsWith('/actions/runs/77/jobs')) {
        return reply(200,{jobs:[
          {id:1,name:'CodeQL security scan',status:'completed',conclusion:'success'},
          {id:2,name:'windows-installer',status:'completed',conclusion:'success'}
        ]});
      }
      return reply(500,{message:'unexpected '+parsed.pathname});
    }
  });
  const status=await client.getCommitCiStatus(sha,branchName);
  assert.equal(status.state,'passed');
  assert.deepEqual(status.requiredChecks.map(item=>item.name),github.REQUIRED_CHECKS);
  assert.equal(status.workflowRun.id,77);
});

test('commit CI status cannot pass when the workflow is green but a required job is absent', async () => {
  const sha='8'.repeat(40);
  const branchName='fix/jarvis-self-repair-v0-3-24-feedface00';
  const client=github.createGitHubSelfRepairClient({
    token:'github_pat_'+'f'.repeat(40),
    fetchImpl:async(url)=>{
      const parsed=new URL(url);
      if (parsed.pathname.endsWith('/actions/runs')) return reply(200,{workflow_runs:[{
        id:78,name:github.WORKFLOW_NAME,head_sha:sha,head_branch:branchName,event:'push',
        run_number:13,status:'completed',conclusion:'success'
      }]});
      if (parsed.pathname.endsWith('/actions/runs/78/jobs')) return reply(200,{jobs:[
        {id:1,name:'CodeQL security scan',status:'completed',conclusion:'success'}
      ]});
      return reply(500,{message:'unexpected'});
    }
  });
  const status=await client.getCommitCiStatus(sha,branchName);
  assert.notEqual(status.state,'passed');
  assert.equal(status.requiredChecks.find(item=>item.name==='windows-installer').status,'missing');
});


test('abandon closes an unmerged Self-Repair PR even if GitHub supplied a hypothetical merge SHA', async () => {
  const sha='7'.repeat(40);
  const branchName='fix/jarvis-self-repair-v0-3-24-abandon000';
  const calls=[];
  const client=github.createGitHubSelfRepairClient({
    token:'github_pat_'+'g'.repeat(40),
    fetchImpl:async(url,options={})=>{
      const parsed=new URL(url);
      const method=options.method || 'GET';
      calls.push({method,path:parsed.pathname});
      if (method==='GET' && parsed.pathname.endsWith('/pulls/42')) {
        return reply(200,{
          number:42,state:'open',merged:false,mergeable:true,mergeable_state:'clean',
          html_url:'https://github.com/example/pr/42',
          head:{ref:branchName,sha},
          base:{ref:'main'},
          merge_commit_sha:'8'.repeat(40)
        });
      }
      if (method==='GET' && parsed.pathname.endsWith('/actions/runs')) return reply(200,{workflow_runs:[]});
      if (method==='PATCH' && parsed.pathname.endsWith('/pulls/42')) return reply(200,{number:42,state:'closed'});
      if (method==='DELETE' && parsed.pathname.includes('/git/refs/heads/')) return reply(204,null);
      return reply(500,{message:`unexpected ${method} ${parsed.pathname}`});
    }
  });
  const result=await client.abandonRepair(42,sha);
  assert.equal(result.abandoned,true);
  assert.equal(calls.some(call=>call.method==='PATCH' && call.path.endsWith('/pulls/42')),true);
  assert.equal(calls.some(call=>call.method==='DELETE' && call.path.includes('/git/refs/heads/')),true);
});

test('green PR CI is not enough when main moved after the repair branch was tested', async () => {
  const headSha='5'.repeat(40);
  const baseSha='4'.repeat(40);
  const movedMain='3'.repeat(40);
  const branch='fix/jarvis-self-repair-v0-3-24-mainmoved00';
  let mergeCalls=0;
  const client=github.createGitHubSelfRepairClient({
    token:'github_pat_'+'m'.repeat(40),
    fetchImpl:async(url,options={})=>{
      const parsed=new URL(url);
      const method=options.method || 'GET';
      if (method==='GET' && parsed.pathname.endsWith('/pulls/44')) {
        return reply(200,{
          number:44,state:'open',merged:false,mergeable:true,mergeable_state:'clean',
          head:{ref:branch,sha:headSha},base:{ref:'main'},merge_commit_sha:null
        });
      }
      if (method==='GET' && parsed.pathname.endsWith('/actions/runs')) {
        return reply(200,{workflow_runs:[{
          id:91,name:github.WORKFLOW_NAME,head_sha:headSha,head_branch:branch,event:'push',
          run_number:21,status:'completed',conclusion:'success'
        }]});
      }
      if (method==='GET' && parsed.pathname.endsWith('/actions/runs/91/jobs')) {
        return reply(200,{jobs:[
          {id:1,name:'CodeQL security scan',status:'completed',conclusion:'success'},
          {id:2,name:'windows-installer',status:'completed',conclusion:'success'}
        ]});
      }
      if (method==='GET' && parsed.pathname.endsWith('/git/ref/heads/main')) {
        return reply(200,{object:{sha:movedMain}});
      }
      if (method==='PUT' && parsed.pathname.endsWith('/pulls/44/merge')) {
        mergeCalls+=1;
        return reply(200,{merged:true,sha:'2'.repeat(40)});
      }
      return reply(500,{message:`unexpected ${method} ${parsed.pathname}`});
    }
  });
  await assert.rejects(()=>client.mergeRepair(44,headSha,baseSha),/GITHUB_REPAIR_BASE_MOVED/);
  assert.equal(mergeCalls,0);
});

test('release dispatch requires exact main commit and both required main CI jobs', async () => {
  const sha='6'.repeat(40);
  const dispatches=[];
  const client=github.createGitHubSelfRepairClient({
    token:'github_pat_'+'h'.repeat(40),
    fetchImpl:async(url,options={})=>{
      const parsed=new URL(url);
      const method=options.method || 'GET';
      if (method==='GET' && parsed.pathname.endsWith('/git/ref/heads/main')) {
        return reply(200,{object:{sha}});
      }
      if (method==='GET' && parsed.pathname.endsWith('/actions/runs')) {
        return reply(200,{workflow_runs:[{
          id:90,name:github.WORKFLOW_NAME,head_sha:sha,head_branch:'main',event:'push',
          run_number:20,status:'completed',conclusion:'success'
        }]});
      }
      if (method==='GET' && parsed.pathname.endsWith('/actions/runs/90/jobs')) {
        return reply(200,{jobs:[
          {id:1,name:'CodeQL security scan',status:'completed',conclusion:'success'},
          {id:2,name:'windows-installer',status:'completed',conclusion:'success'}
        ]});
      }
      if (method==='GET' && parsed.pathname.includes('/contents/package.json')) {
        return reply(200,{type:'file',encoding:'base64',content:b64(JSON.stringify({version:'0.3.24'}))});
      }
      if (method==='GET' && parsed.pathname.endsWith('/releases/tags/v0.3.24')) {
        return reply(404,{message:'Not Found'});
      }
      if (method==='POST' && parsed.pathname.endsWith('/actions/workflows/build-windows.yml/dispatches')) {
        dispatches.push(JSON.parse(options.body));
        return reply(204,null);
      }
      return reply(500,{message:`unexpected ${method} ${parsed.pathname}`});
    }
  });
  const result=await client.dispatchRelease({version:'0.3.24',mergeSha:sha,allowUnsigned:true});
  assert.equal(result.dispatched,true);
  assert.deepEqual(dispatches,[{
    ref:'main',
    inputs:{
      publish_release:'true',
      allow_unsigned_release:'true',
      expected_commit:sha,
      expected_version:'0.3.24'
    }
  }]);
});


test('release manifest must bind version installer checksum main ref and exact release target', () => {
  const hash='1'.repeat(64);
  const commit='2'.repeat(40);
  const result=github.verifyReleaseManifest({
    version:'0.3.24',
    commit,
    ref:'refs/heads/main',
    installer:'Jarvis-Setup-0.3.24-x64.exe',
    sha256:hash
  },{
    version:'0.3.24',
    installer:'Jarvis-Setup-0.3.24-x64.exe',
    sha256:hash,
    targetCommitish:commit
  });
  assert.equal(result.commit,commit);
  assert.throws(()=>github.verifyReleaseManifest({
    version:'0.3.24',commit,ref:'refs/heads/main',
    installer:'Jarvis-Setup-0.3.24-x64.exe',sha256:'3'.repeat(64)
  },{
    version:'0.3.24',installer:'Jarvis-Setup-0.3.24-x64.exe',sha256:hash,targetCommitish:commit
  }),/UPDATE_MANIFEST_CHECKSUM_MISMATCH/);
  assert.throws(()=>github.verifyReleaseManifest({
    version:'0.3.24',commit,ref:'refs/heads/fix',
    installer:'Jarvis-Setup-0.3.24-x64.exe',sha256:hash
  },{
    version:'0.3.24',installer:'Jarvis-Setup-0.3.24-x64.exe',sha256:hash,targetCommitish:commit
  }),/UPDATE_MANIFEST_REF_INVALID/);
  assert.throws(()=>github.verifyReleaseManifest({
    version:'0.3.24',commit,ref:'refs/heads/main',
    installer:'Jarvis-Setup-0.3.24-x64.exe',sha256:hash
  },{
    version:'0.3.24',installer:'Jarvis-Setup-0.3.24-x64.exe',sha256:hash,targetCommitish:'4'.repeat(40)
  }),/UPDATE_MANIFEST_RELEASE_TARGET_MISMATCH/);
});

test('GitHub client independently blocks Self-Repair trust-core files even if upstream plan validation regresses', async () => {
  for (const file of [
    'electron/main.cjs',
    'electron/developer-repair.cjs',
    'electron/github-self-repair.cjs',
    'electron/preload.cjs',
    'src/pages/SystemCenter.jsx',
    'electron/admin-diagnostics.cjs',
    'src/lib/appVersion.js',
    'release-notes/v0.3.24.md',
    'eslint.config.js',
    'tsconfig.json',
    'vite.config.js',
    'src/tests/new-ai-written.test.js',
    '.github/anything.md'
  ]) {
    let calls=0;
    const client=github.createGitHubSelfRepairClient({
      token:'github_pat_'+'z'.repeat(40),
      fetchImpl:async()=>{ calls+=1; return reply(500,{message:'must not be called'}); }
    });
    await assert.rejects(()=>client.createRepairPullRequest({
      hash:'e'.repeat(64),
      goal:'trust core tamper',
      files:[{path:file,content:'changed'}],
      expectedBaseFiles:[{path:file,content:'old'}],
      installedVersion:'0.3.23'
    }),/GITHUB_REPAIR_PATH_BLOCKED/,file);
    assert.equal(calls,0,file);
  }
});


test('desktop updater requires and verifies release-manifest.json before signer or installer handoff', () => {
  const fetchStart=electronMainSource.indexOf('async function fetchLatestRelease()');
  const fetchEnd=electronMainSource.indexOf('async function downloadFile(',fetchStart);
  const fetchBody=electronMainSource.slice(fetchStart,fetchEnd);
  assert.ok(fetchStart>=0 && fetchEnd>fetchStart);
  assert.match(fetchBody,/UPDATE_MANIFEST_NOT_FOUND/);
  assert.match(fetchBody,/release-manifest\.json/);

  const start=electronMainSource.indexOf('async function oneClickUpdate()');
  const end=electronMainSource.indexOf('function payloadContainsSensitiveContext',start);
  const body=electronMainSource.slice(start,end);
  assert.ok(start>=0 && end>start);
  assert.match(body,/await downloadFile\(release\.manifest\.browser_download_url,manifestPath\)/);
  assert.match(body,/githubSelfRepair\.verifyReleaseManifest\(releaseManifest/);
  const manifestGate=body.indexOf('githubSelfRepair.verifyReleaseManifest');
  const signerGate=body.indexOf('const signer = await verifyUpdateSigner');
  const installerHandoff=body.indexOf("const child=spawn('powershell.exe'");
  assert.ok(manifestGate>=0 && signerGate>manifestGate);
  assert.ok(installerHandoff>signerGate);
});

test('an existing closed exact repair PR is cleaned up instead of being reused as success', async () => {
  const repo=github.DEFAULT_REPO;
  const baseSha='a'.repeat(40);
  const hash='f'.repeat(64);
  const branchName='fix/jarvis-self-repair-v0-3-24-'+hash.slice(0,10);
  const headSha='b'.repeat(40);
  const goal='retry closed repair';
  const source='export const value = "old";\n';
  const basePackage={name:'jarvis-desktop',version:'0.3.23'};
  const baseLock={name:'jarvis-desktop',version:'0.3.23',lockfileVersion:3,packages:{'':{name:'jarvis-desktop',version:'0.3.23'}},dependencies:{}};
  const mainFiles=new Map([
    ['src/pages/example.jsx',source],
    ['package.json',JSON.stringify(basePackage,null,2)+'\n'],
    ['package-lock.json',JSON.stringify(baseLock,null,2)+'\n'],
    ['src/lib/appVersion.js',"export const APP_VERSION = '0.3.23';\n"]
  ]);
  const nextPackage={...basePackage,version:'0.3.24'};
  const nextLock=JSON.parse(JSON.stringify(baseLock));
  nextLock.version='0.3.24';
  nextLock.packages[''].version='0.3.24';
  const notes=`# Jarvis v0.3.24

Self-Repair verified update.

- Repair: ${goal}
- Risk: low
- Changed source: src/pages/example.jsx
- Repair hash: ${hash}

## Verification

Before this repair is sent to GitHub, Jarvis applies the exact owner-approved patch in an isolated local workspace and requires direct file validation, the complete automated test suite, lint, typecheck, Jarvis policy verification and renderer build to pass. GitHub must then independently pass CodeQL, the Windows build, packaged Self-Repair checks, admin-helper handshake and startup smoke test before merge.

Publication remains a separate owner action. Unsigned publication requires an explicit unsigned-release approval.
`;
  const branchFiles=new Map([
    ['src/pages/example.jsx',source],
    ['package.json',JSON.stringify(nextPackage,null,2)+'\n'],
    ['package-lock.json',JSON.stringify(nextLock,null,2)+'\n'],
    ['src/lib/appVersion.js',"export const APP_VERSION = '0.3.24';\n"],
    ['release-notes/v0.3.24.md',notes]
  ]);
  let deleted=false;
  const client=github.createGitHubSelfRepairClient({
    token:'github_pat_'+'y'.repeat(40),
    fetchImpl:async(url,options={})=>{
      const parsed=new URL(url);
      const method=options.method || 'GET';
      const p=parsed.pathname;
      if(method==='GET' && p===`/repos/${repo}`) return reply(200,{full_name:repo,owner:{login:'bigzsorzs-sketch'},default_branch:'main',permissions:{push:true}});
      if(method==='GET' && p.endsWith('/actions/workflows/build-windows.yml')) return reply(200,{id:1});
      if(method==='GET' && p.endsWith('/git/ref/heads/main')) return reply(200,{object:{sha:baseSha}});
      if(method==='GET' && p.includes('/git/ref/heads/fix/jarvis-self-repair-')) return reply(200,{object:{sha:headSha}});
      if(method==='GET' && p.startsWith(`/repos/${repo}/contents/`)){
        const file=p.split(`/repos/${repo}/contents/`)[1].split('/').map(decodeURIComponent).join('/');
        const ref=parsed.searchParams.get('ref');
        const value=ref===branchName ? branchFiles.get(file) : mainFiles.get(file);
        if(value===undefined) return reply(404,{message:'Not Found'});
        return reply(200,{type:'file',encoding:'base64',content:b64(value)});
      }
      if(method==='GET' && p.endsWith('/releases/latest')) return reply(200,{tag_name:'v0.3.23',draft:false,prerelease:false});
      if(method==='GET' && p.endsWith('/releases/tags/v0.3.24')) return reply(404,{message:'Not Found'});
      if(method==='GET' && p.endsWith('/pulls')) return reply(200,[{
        number:55,state:'closed',merged:false,html_url:'https://github.com/example/pr/55',head:{sha:headSha,ref:branchName},base:{ref:'main'}
      }]);
      if(method==='DELETE' && p.includes('/git/refs/heads/fix/jarvis-self-repair-')) { deleted=true; return reply(204,null); }
      return reply(500,{message:`unexpected ${method} ${p}`});
    }
  });
  await assert.rejects(()=>client.createRepairPullRequest({
    hash,
    goal,
    risk:'low',
    files:[{path:'src/pages/example.jsx',content:source}],
    expectedBaseFiles:[{path:'src/pages/example.jsx',content:source}],
    installedVersion:'0.3.23'
  }),/GITHUB_REPAIR_PR_CLOSED_RETRY/);
  assert.equal(deleted,true);
});

test('release status rejects a stable-looking release targeted at a different commit', async () => {
  const repo=github.DEFAULT_REPO;
  const mergeSha='c'.repeat(40);
  const client=github.createGitHubSelfRepairClient({
    token:'github_pat_'+'x'.repeat(40),
    fetchImpl:async(url)=>{
      const parsed=new URL(url);
      if(parsed.pathname.endsWith('/releases/tags/v0.3.24')) return reply(200,{
        tag_name:'v0.3.24',draft:false,prerelease:false,target_commitish:'d'.repeat(40),
        assets:[
          {name:'Jarvis-Setup-0.3.24-x64.exe'},
          {name:'Jarvis-Setup-0.3.24-x64.exe.sha256'},
          {name:'release-manifest.json'}
        ]
      });
      return reply(500,{message:'unexpected'});
    }
  });
  await assert.rejects(
    ()=>client.getReleaseStatus({version:'0.3.24',mergeSha}),
    /GITHUB_RELEASE_TARGET_MISMATCH/
  );
});
