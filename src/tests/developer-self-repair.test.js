import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../../electron/developer-repair.cjs');
const main = fs.readFileSync('electron/main.cjs','utf8');
const preload = fs.readFileSync('electron/preload.cjs','utf8');
const upgrade = fs.readFileSync('src/pages/UpgradeCenter.jsx','utf8');

function workspace() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-dev-repair-'));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'jarvis-desktop'}));
  fs.mkdirSync(path.join(root,'src'),{recursive:true});
  fs.writeFileSync(path.join(root,'src','sample.js'),'old');
  return root;
}

test('self-development rejects path traversal and protected core files', () => {
  const root=workspace();
  assert.throws(()=>engine.validatePlan(root,{patches:[{file:'../escape.js',content:'x'}]}),/INVALID_PATH/);
  assert.throws(()=>engine.validatePlan(root,{patches:[{file:'security/core-rules.json',content:'{}'}]}),/PROTECTED_PATH/);
  assert.throws(()=>engine.validatePlan(root,{patches:[{file:'electron/main.cjs',content:'x'}]}),/PROTECTED_PATH/);
});

test('proposal hash changes when approved patch changes', () => {
  const root=workspace();
  const a=engine.validatePlan(root,{goal:'fix',patches:[{file:'src/sample.js',content:'one'}]});
  const b=engine.validatePlan(root,{goal:'fix',patches:[{file:'src/sample.js',content:'two'}]});
  assert.notEqual(a.hash,b.hash);
});

test('snapshot rollback restores original files', () => {
  const root=workspace();
  const plan=engine.validatePlan(root,{goal:'fix',patches:[{file:'src/sample.js',content:'new'}]});
  const backup=engine.snapshot(root,plan,fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-backup-')));
  engine.apply(root,plan);
  assert.equal(fs.readFileSync(path.join(root,'src/sample.js'),'utf8'),'new');
  engine.rollback(root,backup);
  assert.equal(fs.readFileSync(path.join(root,'src/sample.js'),'utf8'),'old');
});

test('IPC requires exact approval and fixed validation path', () => {
  assert.match(main,/DEV_REPAIR_APPROVAL_REQUIRED/);
  assert.match(main,/DEV_REPAIR_PLAN_MUTATED/);
  assert.match(main,/runDeveloperValidation/);
  assert.match(main,/status:'ROLLED_BACK'/);
  assert.doesNotMatch(main,/request\.validationCommands/);
  assert.match(preload,/developerRepair/);
  assert.match(preload,/jarvis:developer:sandbox/);
  assert.match(upgrade,/Futtatás izolált sandboxban/);
  assert.match(upgrade,/Sandbox rendben – jóváhagyom és alkalmazom/);
  assert.match(upgrade,/!validatedPlan\?\.hash \|\| !sandboxVerified/);
});
