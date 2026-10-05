import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const github = require('../../electron/github-self-repair.cjs');

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

function makeGitHubMock({drift=false}={}) {
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
    if (method === 'GET' && path === `/repos/${repo}/pulls`) return reply(200,[]);
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
