'use strict';

const crypto = require('node:crypto');

const DEFAULT_REPO = 'bigzsorzs-sketch/jarvis-windows-v0.1';
const DEFAULT_API = 'https://api.github.com';
const REQUIRED_CHECKS = Object.freeze(['CodeQL security scan','windows-installer']);
const WORKFLOW_NAME = 'Build Jarvis Windows Installer';

function normalizeText(value='') {
  return String(value).replace(/\r\n/g,'\n').replace(/\r/g,'\n');
}
function sha256Text(value='') {
  return crypto.createHash('sha256').update(normalizeText(value),'utf8').digest('hex');
}
function cleanMessage(value='', fallback='Jarvis Self-Repair') {
  const text = String(value || '').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
  return (text || fallback).slice(0,120);
}
function safeMarkdown(value='', max=4000) {
  return String(value || '').replace(/\0/g,'').slice(0,max);
}
function assertToken(token) {
  const value = String(token || '').trim();
  if (value.length < 20 || value.length > 512 || /\s/.test(value)) throw new Error('GITHUB_TOKEN_INVALID');
  return value;
}
function assertRepo(repo) {
  const value = String(repo || '').trim();
  if (value !== DEFAULT_REPO) throw new Error('GITHUB_REPOSITORY_NOT_ALLOWED');
  return value;
}
function assertHash(hash) {
  const value = String(hash || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('GITHUB_REPAIR_HASH_INVALID');
  return value;
}
function assertSha(sha) {
  const value = String(sha || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error('GITHUB_COMMIT_SHA_INVALID');
  return value;
}
function safePath(input) {
  const value = String(input || '').replace(/\\/g,'/').replace(/^\.\//,'');
  if (!value || value.startsWith('/') || value.split('/').some((part)=>!part || part === '.' || part === '..') || value.includes('\0')) {
    throw new Error('GITHUB_REPAIR_PATH_INVALID');
  }
  return value;
}
function assertRepairPath(input) {
  const value = safePath(input);
  if (/^(?:\.github\/|scripts\/|security\/|electron\/security\/|electron\/main\.cjs$|electron\/developer-repair\.cjs$|electron\/github-self-repair\.cjs$|electron\/preload\.cjs$|src\/pages\/SystemCenter\.jsx$|electron\/admin-diagnostics\.cjs$|package\.json$|package-lock\.json$|src\/lib\/appVersion\.js$|release-notes\/|eslint\.config\.js$|tsconfig\.json$|vite\.config\.js$|src\/tests\/)/i.test(value)) {
    throw new Error('GITHUB_REPAIR_PATH_BLOCKED:' + value);
  }
  return value;
}
function pathForApi(input) {
  return safePath(input).split('/').map(encodeURIComponent).join('/');
}
function nextPatchVersion(version) {
  const match = String(version || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error('GITHUB_RELEASE_VERSION_INVALID');
  return [Number(match[1]),Number(match[2]),Number(match[3])+1].join('.');
}
function parseAppVersion(source) {
  const match = String(source || '').match(/APP_VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/);
  if (!match) throw new Error('GITHUB_APP_VERSION_PARSE_FAILED');
  return match[1];
}
function replaceAppVersion(source, version) {
  const current = parseAppVersion(source);
  const updated = String(source).replace(
    /APP_VERSION\s*=\s*['"]\d+\.\d+\.\d+['"]/,
    `APP_VERSION = '${version}'`
  );
  if (updated === source || parseAppVersion(updated) !== version || current === version) {
    throw new Error('GITHUB_APP_VERSION_UPDATE_FAILED');
  }
  return updated;
}
function decodeGitHubContent(payload) {
  if (!payload || payload.type !== 'file' || payload.encoding !== 'base64' || typeof payload.content !== 'string') {
    throw new Error('GITHUB_CONTENT_RESPONSE_INVALID');
  }
  return Buffer.from(payload.content.replace(/\s/g,''),'base64').toString('utf8');
}
function verifyReleaseManifest(manifest,input={}) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('UPDATE_MANIFEST_INVALID');
  }
  const version = String(input.version || '');
  const installer = String(input.installer || '');
  const sha256 = String(input.sha256 || '').toLowerCase();
  if (!/^\d+\.\d+\.\d+$/.test(version) || !installer || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error('UPDATE_MANIFEST_EXPECTATION_INVALID');
  }
  if (String(manifest.version || '') !== version) throw new Error('UPDATE_MANIFEST_VERSION_MISMATCH');
  if (String(manifest.installer || '') !== installer) throw new Error('UPDATE_MANIFEST_INSTALLER_MISMATCH');
  if (String(manifest.sha256 || '').toLowerCase() !== sha256) throw new Error('UPDATE_MANIFEST_CHECKSUM_MISMATCH');
  if (String(manifest.ref || '') !== 'refs/heads/main') throw new Error('UPDATE_MANIFEST_REF_INVALID');
  const commit = String(manifest.commit || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('UPDATE_MANIFEST_COMMIT_INVALID');
  const target = String(input.targetCommitish || '').trim().toLowerCase();
  if (/^[a-f0-9]{40}$/.test(target) && target !== commit) {
    throw new Error('UPDATE_MANIFEST_RELEASE_TARGET_MISMATCH');
  }
  return {version,installer,sha256,commit,ref:'refs/heads/main'};
}

function summarizeChecks(checkRuns=[]) {
  const latest = new Map();
  for (const check of Array.isArray(checkRuns) ? checkRuns : []) {
    const name = String(check?.name || '');
    if (!name) continue;
    const existing = latest.get(name);
    if (!existing || Number(check?.id || 0) > Number(existing?.id || 0)) latest.set(name,check);
  }
  return REQUIRED_CHECKS.map((name) => {
    const check = latest.get(name);
    return {
      name,
      status:check?.status || 'missing',
      conclusion:check?.conclusion || null,
      url:check?.html_url || null
    };
  });
}
function deriveCiState(requiredChecks, workflowRun) {
  if (!workflowRun) return 'pending';
  const failing = requiredChecks.some((check) =>
    check.status === 'completed' && check.conclusion && check.conclusion !== 'success'
  );
  if (failing || (workflowRun.status === 'completed' && workflowRun.conclusion !== 'success')) return 'failed';
  const passedChecks = requiredChecks.every((check) => check.status === 'completed' && check.conclusion === 'success');
  if (passedChecks && workflowRun.status === 'completed' && workflowRun.conclusion === 'success') return 'passed';
  if (requiredChecks.some((check) => ['queued','in_progress','requested','waiting','pending'].includes(check.status))
      || ['queued','in_progress','requested','waiting','pending'].includes(workflowRun.status)) return 'running';
  return 'pending';
}

function createGitHubSelfRepairClient(options={}) {
  const token = assertToken(options.token);
  const repo = assertRepo(options.repo || DEFAULT_REPO);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('GITHUB_FETCH_UNAVAILABLE');
  const apiBase = String(options.apiBase || DEFAULT_API).replace(/\/$/,'');
  const timeoutMs = Math.min(60000, Math.max(3000, Number(options.timeoutMs) || 20000));
  const [owner] = repo.split('/');

  async function request(apiPath,{method='GET',body,allow404=false,accept='application/vnd.github+json'}={}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(apiBase + apiPath,{
        method,
        signal:controller.signal,
        headers:{
          Accept:accept,
          Authorization:`Bearer ${token}`,
          'X-GitHub-Api-Version':'2022-11-28',
          'User-Agent':'Jarvis-Self-Repair',
          ...(body === undefined ? {} : {'Content-Type':'application/json'})
        },
        ...(body === undefined ? {} : { body:JSON.stringify(body) })
      });
      if (allow404 && response.status === 404) return null;
      let data = null;
      const text = await response.text();
      if (text) {
        try { data = JSON.parse(text); }
        catch { data = text.slice(0,1200); }
      }
      if (!response.ok) {
        const message = typeof data === 'object' && data ? data.message : String(data || '');
        const error = new Error(`GITHUB_API_${response.status}: ${String(message || 'request failed').slice(0,500)}`);
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('GITHUB_API_TIMEOUT');
      if (/^GITHUB_/.test(String(error?.message || ''))) throw error;
      throw new Error('GITHUB_API_NETWORK_ERROR: ' + String(error?.message || error || 'network failure').slice(0,300));
    } finally {
      clearTimeout(timer);
    }
  }

  async function getRepository() {
    const data = await request(`/repos/${repo}`);
    if (String(data?.full_name || '') !== repo) throw new Error('GITHUB_REPOSITORY_MISMATCH');
    if (data?.permissions && data.permissions.push !== true) throw new Error('GITHUB_CONTENTS_WRITE_REQUIRED');
    return data;
  }
  async function validateConnection() {
    const repository = await getRepository();
    const workflow = await request(`/repos/${repo}/actions/workflows/build-windows.yml`);
    if (!workflow?.id) throw new Error('GITHUB_ACTIONS_ACCESS_REQUIRED');
    return {
      connected:true,
      repo,
      owner:repository.owner?.login || owner,
      defaultBranch:repository.default_branch || 'main',
      private:Boolean(repository.private),
      workflowId:workflow.id
    };
  }
  async function getRef(branch) {
    const branchPath = String(branch || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
    if (!branchPath) throw new Error('GITHUB_BRANCH_INVALID');
    return request(`/repos/${repo}/git/ref/heads/${branchPath}`,{allow404:true});
  }
  async function getCommit(sha) {
    return request(`/repos/${repo}/git/commits/${assertSha(sha)}`);
  }
  async function getContent(file,ref) {
    const result = await request(`/repos/${repo}/contents/${pathForApi(file)}?ref=${encodeURIComponent(String(ref || 'main'))}`,{allow404:true});
    return result ? decodeGitHubContent(result) : null;
  }
  async function getLatestRelease() {
    return request(`/repos/${repo}/releases/latest`,{allow404:true});
  }
  async function getRelease(version) {
    return request(`/repos/${repo}/releases/tags/v${encodeURIComponent(String(version || ''))}`,{allow404:true});
  }
  async function findPullRequest(branch) {
    const query = new URLSearchParams({state:'all',head:`${owner}:${branch}`,base:'main',per_page:'20'}).toString();
    const pulls = await request(`/repos/${repo}/pulls?${query}`);
    return Array.isArray(pulls) ? pulls[0] || null : null;
  }
  async function verifyRemoteBase(expectedFiles, baseSha) {
    for (const item of expectedFiles) {
      const file = assertRepairPath(item.path);
      const remote = await getContent(file,baseSha);
      if (item.content === null || item.content === undefined) {
        if (remote !== null) throw new Error('GITHUB_REPAIR_REMOTE_FILE_APPEARED:' + file);
        continue;
      }
      if (remote === null) throw new Error('GITHUB_REPAIR_REMOTE_FILE_MISSING:' + file);
      if (sha256Text(remote) !== sha256Text(item.content)) {
        throw new Error('GITHUB_REPAIR_REMOTE_SOURCE_CHANGED:' + file);
      }
    }
  }
  async function buildReleaseMetadata(baseSha,repair) {
    const [packageSource,lockSource,appVersionSource,latest] = await Promise.all([
      getContent('package.json',baseSha),
      getContent('package-lock.json',baseSha),
      getContent('src/lib/appVersion.js',baseSha),
      getLatestRelease()
    ]);
    if (!packageSource || !lockSource || !appVersionSource) throw new Error('GITHUB_RELEASE_METADATA_MISSING');
    const pkg = JSON.parse(packageSource);
    const lock = JSON.parse(lockSource);
    const currentVersion = String(pkg.version || '');
    if (!/^\d+\.\d+\.\d+$/.test(currentVersion)) throw new Error('GITHUB_RELEASE_VERSION_INVALID');
    const installedVersion = String(repair.installedVersion || '');
    if (!/^\d+\.\d+\.\d+$/.test(installedVersion)) throw new Error('GITHUB_INSTALLED_VERSION_REQUIRED');
    if (installedVersion !== currentVersion) throw new Error('GITHUB_INSTALLED_VERSION_NOT_LATEST');
    if (String(lock.version || '') !== currentVersion || String(lock.packages?.['']?.version || '') !== currentVersion) {
      throw new Error('GITHUB_RELEASE_LOCK_VERSION_MISMATCH');
    }
    if (parseAppVersion(appVersionSource) !== currentVersion) throw new Error('GITHUB_RELEASE_APP_VERSION_MISMATCH');
    const latestVersion = String(latest?.tag_name || '').replace(/^v/i,'');
    if (!latest || latest.draft || latest.prerelease || latestVersion !== currentVersion) {
      throw new Error('GITHUB_RELEASE_BASE_NOT_LATEST_STABLE');
    }
    const version = nextPatchVersion(currentVersion);
    if (await getRelease(version)) throw new Error('GITHUB_RELEASE_VERSION_ALREADY_EXISTS');

    pkg.version = version;
    lock.version = version;
    if (!lock.packages?.['']) throw new Error('GITHUB_RELEASE_LOCK_ROOT_MISSING');
    lock.packages[''].version = version;
    const appVersion = replaceAppVersion(appVersionSource,version);
    const files = repair.files.map((item)=>item.path).join(', ');
    const notes = `# Jarvis v${version}

Self-Repair verified update.

- Repair: ${safeMarkdown(repair.goal,500)}
- Risk: ${safeMarkdown(repair.risk || 'medium',50)}
- Changed source: ${safeMarkdown(files,1800)}
- Repair hash: ${repair.hash}

## Verification

Before this repair is sent to GitHub, Jarvis applies the exact owner-approved patch in an isolated local workspace and requires direct file validation, the complete automated test suite, lint, typecheck, Jarvis policy verification and renderer build to pass. GitHub must then independently pass CodeQL, the Windows build, packaged Self-Repair checks, admin-helper handshake and startup smoke test before merge.

Publication remains a separate owner action. Unsigned publication requires an explicit unsigned-release approval.
`;

    return {
      currentVersion,
      version,
      files:[
        {path:'package.json',content:JSON.stringify(pkg,null,2)+'\n'},
        {path:'package-lock.json',content:JSON.stringify(lock,null,2)+'\n'},
        {path:'src/lib/appVersion.js',content:appVersion},
        {path:`release-notes/v${version}.md`,content:notes}
      ]
    };
  }
  async function verifyBranchFiles(branch,files) {
    for (const item of files) {
      const remote = await getContent(item.path,branch);
      if (remote === null || sha256Text(remote) !== sha256Text(item.content)) {
        throw new Error('GITHUB_REPAIR_BRANCH_VERIFY_FAILED:' + item.path);
      }
    }
  }
  async function verifyExistingRepairBranch(baseSha,headSha,files) {
    // A retry may reuse a previously opened repair branch, but checking only
    // the expected file contents would miss unrelated files pushed later.
    const commit = await getCommit(headSha);
    if (!Array.isArray(commit?.parents) || commit.parents.length !== 1
        || assertSha(commit.parents[0]?.sha) !== assertSha(baseSha)) {
      throw new Error('GITHUB_REPAIR_BRANCH_BASE_CHANGED');
    }
    const diff = await request(`/repos/${repo}/compare/${baseSha}...${headSha}?per_page=100`);
    const changes = Array.isArray(diff?.files) ? diff.files : null;
    const allowed = new Set(files.map((item)=>item.path));
    if (diff?.status !== 'ahead' || Number(diff?.total_commits) !== 1 || !changes
        || changes.length !== allowed.size || changes.some((item)=>
          !allowed.has(item?.filename) || !['added','modified'].includes(item?.status)
        )) {
      throw new Error('GITHUB_REPAIR_BRANCH_DIFF_MISMATCH');
    }
  }
  async function createRepairPullRequest(input={}) {
    const hash = assertHash(input.hash);
    const goal = cleanMessage(input.goal,'Jarvis Self-Repair');
    const risk = ['low','medium','high'].includes(input.risk) ? input.risk : 'medium';
    const files = (Array.isArray(input.files) ? input.files : []).map((item)=>({
      path:assertRepairPath(item.path),
      content:normalizeText(item.content)
    }));
    const expectedBaseFiles = (Array.isArray(input.expectedBaseFiles) ? input.expectedBaseFiles : []).map((item)=>({
      path:assertRepairPath(item.path),
      content:item.content === null || item.content === undefined ? null : normalizeText(item.content)
    }));
    if (!files.length || files.length > 8) throw new Error('GITHUB_REPAIR_FILE_COUNT_INVALID');
    if (new Set(files.map((item)=>item.path)).size !== files.length) throw new Error('GITHUB_REPAIR_DUPLICATE_PATH');
    if (new Set(expectedBaseFiles.map((item)=>item.path)).size !== expectedBaseFiles.length) throw new Error('GITHUB_REPAIR_DUPLICATE_BASE_PATH');
    if (expectedBaseFiles.length !== files.length || expectedBaseFiles.some((item,index)=>item.path !== files[index].path)) {
      throw new Error('GITHUB_REPAIR_BASE_SET_MISMATCH');
    }
    for (const item of files) {
      if (Buffer.byteLength(item.content,'utf8') > 900000) throw new Error('GITHUB_REPAIR_FILE_TOO_LARGE:' + item.path);
    }

    const connection = await validateConnection();
    if (connection.defaultBranch !== 'main') throw new Error('GITHUB_DEFAULT_BRANCH_MUST_BE_MAIN');
    const baseRef = await getRef('main');
    const baseSha = assertSha(baseRef?.object?.sha);
    await verifyRemoteBase(expectedBaseFiles,baseSha);
    const release = await buildReleaseMetadata(baseSha,{hash,goal,risk,files,installedVersion:input.installedVersion});
    const allFiles = [...files,...release.files];
    if (new Set(allFiles.map((item)=>item.path)).size !== allFiles.length) throw new Error('GITHUB_REPAIR_RELEASE_PATH_COLLISION');

    const branch = `fix/jarvis-self-repair-v${release.version.replace(/\./g,'-')}-${hash.slice(0,10)}`;
    const existingRef = await getRef(branch);
    if (existingRef) {
      await verifyBranchFiles(branch,allFiles);
      const existingPr = await findPullRequest(branch);
      if (!existingPr) throw new Error('GITHUB_REPAIR_BRANCH_EXISTS_WITHOUT_PR');
      if (existingPr.merged === true) throw new Error('GITHUB_REPAIR_ALREADY_MERGED');
      if (existingPr.state !== 'open') {
        const branchPath = branch.split('/').map(encodeURIComponent).join('/');
        await request(`/repos/${repo}/git/refs/heads/${branchPath}`,{method:'DELETE',allow404:true});
        throw new Error('GITHUB_REPAIR_PR_CLOSED_RETRY');
      }
      if (assertSha(existingPr?.head?.sha) !== assertSha(existingRef.object.sha)) {
        throw new Error('GITHUB_REPAIR_PR_HEAD_MISMATCH');
      }
      await verifyExistingRepairBranch(baseSha,assertSha(existingRef.object.sha),allFiles);
      return {
        reused:true,
        repo,
        baseSha,
        branch,
        headSha:assertSha(existingRef.object.sha),
        version:release.version,
        prNumber:Number(existingPr.number),
        prUrl:existingPr.html_url || null
      };
    }

    const baseCommit = await getCommit(baseSha);
    const baseTreeSha = assertSha(baseCommit?.tree?.sha);
    const treeEntries = [];
    for (const item of allFiles) {
      const blob = await request(`/repos/${repo}/git/blobs`,{
        method:'POST',
        body:{content:normalizeText(item.content),encoding:'utf-8'}
      });
      treeEntries.push({path:item.path,mode:'100644',type:'blob',sha:assertSha(blob?.sha)});
    }
    const tree = await request(`/repos/${repo}/git/trees`,{
      method:'POST',
      body:{base_tree:baseTreeSha,tree:treeEntries}
    });
    const commit = await request(`/repos/${repo}/git/commits`,{
      method:'POST',
      body:{
        message:`fix(self-repair): ${goal}\n\nRepair hash: ${hash}\nCandidate version: ${release.version}`,
        tree:assertSha(tree?.sha),
        parents:[baseSha]
      }
    });
    const headSha = assertSha(commit?.sha);
    await request(`/repos/${repo}/git/refs`,{
      method:'POST',
      body:{ref:`refs/heads/${branch}`,sha:headSha}
    });

    try {
      await verifyBranchFiles(branch,allFiles);
      const validationText = Array.isArray(input.validation)
        ? input.validation.map((item)=>`- ${safeMarkdown(item.cmd || 'check',180)}: ${item.ok ? 'PASS' : 'FAIL'}`).join('\n')
        : '- Local validation completed';
      const body = `## Jarvis Self-Repair

**Goal:** ${safeMarkdown(goal,1000)}

**Repair hash:** \`${hash}\`  
**Risk:** ${risk}  
**Base:** \`${baseSha}\`  
**Candidate version:** \`v${release.version}\`

### Changed source
${files.map((item)=>`- \`${item.path}\``).join('\n')}

### Local validation
${validationText}

This pull request was created only after the exact owner-approved patch passed Jarvis local validation. It must still pass the independent GitHub CodeQL and Windows CI gates before merge. Publication is a separate owner action.
`;
      const pr = await request(`/repos/${repo}/pulls`,{
        method:'POST',
        body:{
          title:`Jarvis Self-Repair v${release.version}: ${goal}`.slice(0,240),
          head:branch,
          base:'main',
          body,
          draft:false
        }
      });
      return {
        reused:false,
        repo,
        baseSha,
        branch,
        headSha,
        version:release.version,
        prNumber:Number(pr?.number),
        prUrl:pr?.html_url || null
      };
    } catch (error) {
      try {
        const branchPath = branch.split('/').map(encodeURIComponent).join('/');
        await request(`/repos/${repo}/git/refs/heads/${branchPath}`,{method:'DELETE'});
      } catch {}
      throw error;
    }
  }
  async function getCommitCiStatus(commitSha,branch) {
    const sha = assertSha(commitSha);
    const runsPayload = await request(
      `/repos/${repo}/actions/runs?head_sha=${sha}&branch=${encodeURIComponent(String(branch || ''))}&per_page=30`
    );
    const runs = Array.isArray(runsPayload?.workflow_runs) ? runsPayload.workflow_runs : [];
    const workflowRun = runs
      .filter((run)=>run?.name === WORKFLOW_NAME && run?.head_sha === sha && run?.head_branch === branch && run?.event === 'push')
      .sort((a,b)=>Number(b?.run_number || 0)-Number(a?.run_number || 0))[0] || null;
    let jobs = [];
    if (workflowRun?.id) {
      const jobsPayload = await request(`/repos/${repo}/actions/runs/${workflowRun.id}/jobs?per_page=100`);
      jobs = Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : [];
    }
    const requiredChecks = summarizeChecks(jobs);
    return {
      state:deriveCiState(requiredChecks,workflowRun),
      requiredChecks,
      workflowRun:workflowRun ? {
        id:workflowRun.id,
        status:workflowRun.status,
        conclusion:workflowRun.conclusion,
        url:workflowRun.html_url || null,
        runNumber:workflowRun.run_number
      } : null
    };
  }
  async function getPullRequestStatus(prNumber) {
    const number = Number(prNumber);
    if (!Number.isInteger(number) || number < 1) throw new Error('GITHUB_PR_NUMBER_INVALID');
    const pr = await request(`/repos/${repo}/pulls/${number}`);
    if (pr?.base?.ref !== 'main' || !String(pr?.head?.ref || '').startsWith('fix/jarvis-self-repair-')) {
      throw new Error('GITHUB_PR_NOT_SELF_REPAIR');
    }
    const headSha = assertSha(pr?.head?.sha);
    const ci = await getCommitCiStatus(headSha,pr.head.ref);
    return {
      prNumber:number,
      prUrl:pr.html_url || null,
      state:pr.state,
      merged:Boolean(pr.merged),
      mergeable:pr.mergeable,
      mergeableState:pr.mergeable_state || null,
      headSha,
      branch:pr.head.ref,
      mergeCommitSha:pr.merge_commit_sha && /^[a-f0-9]{40}$/i.test(pr.merge_commit_sha) ? pr.merge_commit_sha.toLowerCase() : null,
      ci
    };
  }
  async function abandonRepair(prNumber,expectedHeadSha) {
    const status = await getPullRequestStatus(prNumber);
    const expected = assertSha(expectedHeadSha);
    // GitHub sets merge_commit_sha for some open PRs to a *prospective*
    // merge result. Only the explicit merged flag proves the PR was merged.
    if (status.merged) throw new Error('GITHUB_REPAIR_ALREADY_MERGED');
    if (status.headSha !== expected) throw new Error('GITHUB_REPAIR_HEAD_CHANGED');
    if (status.state === 'open') {
      await request(`/repos/${repo}/pulls/${Number(prNumber)}`,{
        method:'PATCH',
        body:{state:'closed'}
      });
    }
    const branchPath = status.branch.split('/').map(encodeURIComponent).join('/');
    await request(`/repos/${repo}/git/refs/heads/${branchPath}`,{method:'DELETE',allow404:true});
    return {abandoned:true,prNumber:Number(prNumber),branch:status.branch};
  }

  async function mergeRepair(prNumber,expectedHeadSha,expectedBaseSha) {
    const status = await getPullRequestStatus(prNumber);
    const expected = assertSha(expectedHeadSha);
    const expectedBase = assertSha(expectedBaseSha);
    if (status.merged) return {alreadyMerged:true,mergeSha:assertSha(status.mergeCommitSha),status};
    if (status.state !== 'open') throw new Error('GITHUB_REPAIR_PR_NOT_OPEN');
    if (status.headSha !== expected) throw new Error('GITHUB_REPAIR_HEAD_CHANGED');
    if (status.ci.state !== 'passed') throw new Error('GITHUB_REPAIR_CI_NOT_PASSED');

    // A green repair branch is not sufficient if main moved after that branch
    // was created. The tested branch must still be based on the exact current
    // main commit, otherwise the integration bytes were never independently
    // validated together.
    const mainRef = await getRef('main');
    const currentMain = assertSha(mainRef?.object?.sha);
    if (currentMain !== expectedBase) throw new Error('GITHUB_REPAIR_BASE_MOVED');

    if (status.mergeable !== true || status.mergeableState === 'dirty') {
      throw new Error('GITHUB_REPAIR_PR_NOT_MERGEABLE');
    }
    const merged = await request(`/repos/${repo}/pulls/${Number(prNumber)}/merge`,{
      method:'PUT',
      body:{sha:expected,merge_method:'squash',commit_title:`Jarvis Self-Repair: merge PR #${Number(prNumber)}`}
    });
    if (!merged?.merged || !merged.sha) throw new Error('GITHUB_REPAIR_MERGE_FAILED');
    return {alreadyMerged:false,mergeSha:assertSha(merged.sha),message:merged.message || '',status};
  }
  async function getMainStatus(mergeSha) {
    const sha = assertSha(mergeSha);
    const ref = await getRef('main');
    const currentMain = assertSha(ref?.object?.sha);
    if (currentMain !== sha) {
      return {state:'main-moved',headSha:currentMain,expectedSha:sha,ci:null};
    }
    return {state:'current',headSha:currentMain,expectedSha:sha,ci:await getCommitCiStatus(sha,'main')};
  }
  async function dispatchRelease({version,mergeSha,allowUnsigned=false}={}) {
    const releaseVersion = String(version || '');
    if (!/^\d+\.\d+\.\d+$/.test(releaseVersion)) throw new Error('GITHUB_RELEASE_VERSION_INVALID');
    const sha = assertSha(mergeSha);
    const main = await getMainStatus(sha);
    if (main.state !== 'current') throw new Error('GITHUB_RELEASE_MAIN_MOVED');
    if (main.ci?.state !== 'passed') throw new Error('GITHUB_RELEASE_MAIN_CI_NOT_PASSED');
    const packageSource = await getContent('package.json',sha);
    const pkg = JSON.parse(packageSource || '{}');
    if (String(pkg.version || '') !== releaseVersion) throw new Error('GITHUB_RELEASE_MAIN_VERSION_MISMATCH');
    if (await getRelease(releaseVersion)) return {alreadyReleased:true,version:releaseVersion};
    await request(`/repos/${repo}/actions/workflows/build-windows.yml/dispatches`,{
      method:'POST',
      body:{
        ref:'main',
        inputs:{
          publish_release:'true',
          allow_unsigned_release:allowUnsigned ? 'true' : 'false',
          expected_commit:sha,
          expected_version:releaseVersion
        }
      }
    });
    return {alreadyReleased:false,dispatched:true,version:releaseVersion,allowUnsigned:Boolean(allowUnsigned),dispatchedAt:new Date().toISOString()};
  }
  async function getReleaseStatus({version,mergeSha,dispatchedAt}={}) {
    const releaseVersion = String(version || '');
    const release = await getRelease(releaseVersion);
    if (release) {
      const names = new Set((release.assets || []).map((asset)=>asset.name));
      const required = [
        `Jarvis-Setup-${releaseVersion}-x64.exe`,
        `Jarvis-Setup-${releaseVersion}-x64.exe.sha256`,
        'release-manifest.json'
      ];
      if (release.draft || release.prerelease || required.some((name)=>!names.has(name))) {
        throw new Error('GITHUB_RELEASE_ASSETS_INVALID');
      }
      if (String(release.target_commitish || '').toLowerCase() !== assertSha(mergeSha)) {
        throw new Error('GITHUB_RELEASE_TARGET_MISMATCH');
      }
      return {state:'released',version:releaseVersion,url:release.html_url || null,publishedAt:release.published_at || null};
    }
    const sha = assertSha(mergeSha);
    const runsPayload = await request(`/repos/${repo}/actions/runs?event=workflow_dispatch&branch=main&head_sha=${sha}&per_page=20`);
    const lowerBound = dispatchedAt ? Date.parse(dispatchedAt) - 60000 : 0;
    const run = (Array.isArray(runsPayload?.workflow_runs) ? runsPayload.workflow_runs : [])
      .filter((item)=>item?.name === WORKFLOW_NAME && (!lowerBound || Date.parse(item.created_at || 0) >= lowerBound))
      .sort((a,b)=>Number(b?.run_number || 0)-Number(a?.run_number || 0))[0] || null;
    if (!run) return {state:'pending',version:releaseVersion,workflowRun:null};
    const state = run.status === 'completed'
      ? (run.conclusion === 'success' ? 'awaiting-release' : 'failed')
      : 'running';
    return {state,version:releaseVersion,workflowRun:{id:run.id,status:run.status,conclusion:run.conclusion,url:run.html_url || null}};
  }

  return {
    repo,
    validateConnection,
    createRepairPullRequest,
    getPullRequestStatus,
    abandonRepair,
    mergeRepair,
    getMainStatus,
    dispatchRelease,
    getReleaseStatus,
    getCommitCiStatus
  };
}

module.exports = {
  DEFAULT_REPO,
  REQUIRED_CHECKS,
  WORKFLOW_NAME,
  normalizeText,
  sha256Text,
  nextPatchVersion,
  parseAppVersion,
  replaceAppVersion,
  verifyReleaseManifest,
  summarizeChecks,
  deriveCiState,
  createGitHubSelfRepairClient
};
