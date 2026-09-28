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
const system = fs.readFileSync('src/pages/SystemCenter.jsx','utf8');
const workflow = fs.readFileSync('.github/workflows/build-windows.yml','utf8');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));

function makeWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-auto-repair-'));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'jarvis-desktop'}));
  fs.mkdirSync(path.join(root,'src'),{recursive:true});
  fs.writeFileSync(path.join(root,'src','sample.js'),'const value = 1;\nexport default value;\n');
  return root;
}

test('repair engine supports exact replacement patches without weakening protected paths', () => {
  const root = makeWorkspace();
  try {
    const plan = repair.validatePlan(root,{
      goal:'change value',
      patches:[{
        file:'src/sample.js',
        replacements:[{search:'const value = 1;',replace:'const value = 2;',all:false}]
      }]
    });
    repair.apply(root,plan);
    assert.match(fs.readFileSync(path.join(root,'src','sample.js'),'utf8'),/const value = 2;/);
    assert.throws(
      () => repair.validatePlan(root,{patches:[{file:'electron/main.cjs',replacements:[{search:'x',replace:'y'}]}]}),
      /PROTECTED_PATH/
    );
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('ambiguous exact replacement is rejected at apply time', () => {
  const root = makeWorkspace();
  try {
    fs.writeFileSync(path.join(root,'src','sample.js'),'same\nsame\n');
    const plan = repair.validatePlan(root,{
      patches:[{file:'src/sample.js',replacements:[{search:'same',replace:'new',all:false}]}]
    });
    assert.throws(() => repair.apply(root,plan),/SEARCH_AMBIGUOUS/);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('Autopilot runs analyze sandbox validate apply revalidate and stops before release', () => {
  assert.match(main,/async function runAutonomousSelfRepair/);
  assert.match(main,/generateAutonomousRepairProposal/);
  assert.match(main,/createSandbox\(workspace,plan/);
  assert.match(main,/runDeveloperValidation\(sandbox\)/);
  assert.match(main,/developerRepair\.snapshot\(workspace,plan/);
  assert.match(main,/developerRepair\.rollback\(workspace,backup\)/);
  assert.match(main,/RELEASE_CANDIDATE_READY/);
  assert.match(main,/releaseApproved:false/);
  assert.match(main,/Never publish, tag, push a release/);
});

test('release approval is exposed as a separate owner-only gate', () => {
  assert.match(main,/jarvis:self-repair:release:approve/);
  assert.match(main,/localOwnerAuthorised\(\)/);
  assert.match(main,/RELEASE_APPROVED_BY_OWNER/);
  assert.match(preload,/approveReleaseCandidate/);
  assert.match(system,/Release engedélyezése/);
  assert.match(system,/Autopilot indítása/);
});

test('GitHub release publication requires explicit manual workflow approval', () => {
  assert.match(workflow,/workflow_dispatch:[\s\S]*publish_release:/);
  assert.match(workflow,/if: github\.event_name == 'workflow_dispatch' && inputs\.publish_release == true/);
  assert.doesNotMatch(workflow,/if: startsWith\(github\.ref, 'refs\/tags\/v'\) \|\| startsWith\(github\.event\.head_commit\.message, 'Release v'\)/);
});

test('packaged app includes the files needed to prepare a self-development workspace', () => {
  for (const file of ['package-lock.json','index.html','eslint.config.js','postcss.config.js','jsconfig.json','components.json','build/installer.nsh']) {
    assert.equal(pkg.build.files.includes(file),true,file);
  }
});
