import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repair = require('../../electron/developer-repair.cjs');

const auth = fs.readFileSync('src/lib/AuthContext.jsx','utf8');
const app = fs.readFileSync('src/App.jsx','utf8');
const pageNotFound = fs.readFileSync('src/lib/PageNotFound.jsx','utf8');
const main = fs.readFileSync('electron/main.cjs','utf8');
const system = fs.readFileSync('src/pages/SystemCenter.jsx','utf8');

test('auth failures are normalized and internal routes never render in a half-auth state', () => {
  assert.match(auth,/function normalizeAuthError/);
  assert.match(auth,/type:'auth_required'/);
  assert.match(auth,/type:'user_not_registered'/);
  assert.match(auth,/type:'network_error'/);
  assert.match(auth,/type:'local_profile_error'/);
  assert.match(auth,/LOCAL_OWNER_PROFILE_MISSING/);
  assert.match(app,/function AuthFailureScreen/);
  assert.match(app,/authChecked && !isAuthenticated/);
  assert.match(app,/return <AuthFailureScreen error=\{authError\} onRetry=\{checkAppState\}/);
  assert.doesNotMatch(app,/navigateToLogin\(\); return null/);
});

test('HashRouter 404 uses router navigation instead of replacing the document URL', () => {
  assert.match(pageNotFound,/useNavigate/);
  assert.match(pageNotFound,/onClick=\{\(\) => navigate\('\/'\)\}/);
  assert.doesNotMatch(pageNotFound,/window\.location\.href\s*=\s*['"]\/['"]/);
});

test('manual Self-Repair plan survives a main-process restart with integrity checks', () => {
  assert.match(main,/function persistManualRepairPlan/);
  assert.match(main,/function loadPersistedManualRepairPlan/);
  assert.match(main,/sourceFingerprint:selfRepairSourceFingerprint\(selfRepairSourceRoot\(\)\)/);
  assert.match(main,/developerRepair\.proposalHash\(approvedPlan\)/);
  // Restart recovery must revalidate the persisted proposal; the in-memory cache
  // alone must never bypass workspace integrity or expiry checks.
  assert.match(main,/const entry=loadPersistedManualRepairPlan\(hash\)/);
  assert.match(main,/workspaceSourceFingerprint:selfRepairSourceFingerprint\(entry\.workspace\)/);
  assert.match(main,/saved\.workspaceSourceFingerprint !== selfRepairSourceFingerprint\(manualRepairWorkspaceRoot\(\)\)/);
  assert.doesNotMatch(main,/const entry=manualRepairPlans\.get\(hash\) \|\| loadPersistedManualRepairPlan\(hash\)/);
  assert.match(main,/removePersistedManualRepairPlan\(hash\)/);
  assert.match(system,/MANUAL_REPAIR_PLAN_\(\?:NOT_FOUND\|EXPIRED\|MUTATED\)/);
  assert.match(system,/setPendingRepair\(null\)/);
});

test('Self-Repair retrieves semantic dependencies and query-relevant regions from long files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-context-'));
  try {
    fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'jarvis-desktop',version:'test'}));
    fs.mkdirSync(path.join(root,'src','lib'),{recursive:true});
    fs.mkdirSync(path.join(root,'src','api'),{recursive:true});
    fs.mkdirSync(path.join(root,'electron'),{recursive:true});

    fs.writeFileSync(
      path.join(root,'src','App.jsx'),
      "import { AuthProvider } from './lib/AuthContext'; export default function App(){ return AuthProvider; }"
    );
    fs.writeFileSync(
      path.join(root,'src','lib','AuthContext.jsx'),
      "export const filler='" + "x".repeat(14000) + "';\nexport const AUTH_REQUIRED_MARKER = true;"
    );
    fs.writeFileSync(path.join(root,'src','api','jarvisClient.js'),"export const jarvis={auth:{}};");
    fs.writeFileSync(path.join(root,'electron','main.cjs'),"module.exports={};");

    const ctx = repair.buildDiagnosticContext(root,'auth required login',{maxFiles:10,maxChars:30000});
    const authExcerpt = ctx.excerpts.find((item) => item.path === 'src/lib/AuthContext.jsx');
    assert.ok(authExcerpt);
    assert.match(authExcerpt.excerpt,/AUTH_REQUIRED_MARKER/);
    assert.equal(ctx.excerpts.some((item) => item.path === 'src/api/jarvisClient.js'),true);
    assert.equal(ctx.excerpts.some((item) => item.path === 'src/App.jsx'),true);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});
