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

test('Autopilot cannot rewrite existing tests, package metadata or release infrastructure', () => {
  const root = makeWorkspace();
  try {
    fs.mkdirSync(path.join(root,'src','tests'),{recursive:true});
    fs.writeFileSync(path.join(root,'src','tests','existing.test.js'),'test');
    assert.throws(
      () => repair.validatePlan(root,{patches:[{file:'src/tests/existing.test.js',content:'changed'}]}),
      /EXISTING_TEST_PROTECTED/
    );
    assert.throws(
      () => repair.validatePlan(root,{patches:[{file:'package.json',content:'{}'}]}),
      /PROTECTED_PATH/
    );
    assert.throws(
      () => repair.validatePlan(root,{patches:[{file:'.github/workflows/build-windows.yml',content:'x'}]}),
      /PROTECTED_PATH/
    );
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
  for (const file of ['package-lock.json','index.html','eslint.config.js','postcss.config.js','jsconfig.json','components.json','build/installer.nsh','scripts/**/*']) {
    assert.equal(pkg.build.files.includes(file),true,file);
  }
});


test('packaged Autopilot copies its editable workspace from real resources, not app.asar', () => {
  assert.match(main,/function autonomousSourceRoot\(\)[\s\S]*process\.resourcesPath[\s\S]*self-development-source/);
  assert.match(main,/const sourceRoot = autonomousSourceRoot\(\);/);
  assert.doesNotMatch(main,/const sourceRoot = resourcePath\(\);/);
  const resources = pkg.build.extraResources || [];
  const required = new Map([
    ['src','self-development-source/src'],
    ['electron','self-development-source/electron'],
    ['security','self-development-source/security'],
    ['build','self-development-source/build'],
    ['scripts','self-development-source/scripts']
  ]);
  for (const [from,to] of required) {
    assert.ok(resources.some((item) => item?.from === from && item?.to === to), from + ' -> ' + to);
  }
  assert.ok(
    resources.some((item) => item?.from === 'build/self-development-package.json' && item?.to === 'self-development-source/package.json'),
    'staged full package.json must be bundled as editable Self-Repair source'
  );
  assert.equal(resources.some((item) => item?.from === '.' && String(item?.to || '').startsWith('self-development-source')),false,'project root must not be used as an extraResources source');
  assert.match(main,/const source = fs\.existsSync\(externalSource\) \? externalSource : resourcePath\(entry\)/);
  assert.match(main,/fs\.writeFileSync\(destination,fs\.readFileSync\(source\)\)/);
});


test('installed Autopilot uses its bundled Node/npm toolchain instead of system node/npm', () => {
  assert.match(main,/function selfRepairToolchainPaths\(\)/);
  assert.match(main,/AUTONOMOUS_REPAIR_TOOLCHAIN_MISSING/);
  assert.match(main,/runToolchainNode/);
  assert.match(main,/runToolchainNpm/);
  assert.doesNotMatch(main,/execFileAsync\('npm',\['ci'\]/);
  assert.doesNotMatch(main,/const runner = process\.platform === 'win32' \? 'npx\.cmd'/);
  const resources = pkg.build.extraResources || [];
  assert.ok(resources.some((item) => item?.from === 'build/self-repair-toolchain' && item?.to === 'self-repair-toolchain'));
  assert.match(workflow,/Stage installed Self-Repair toolchain/);
  assert.match(fs.readFileSync('scripts/stage-self-repair-toolchain.cjs','utf8'),/self-development-package\.json/);
  assert.match(workflow,/Verify packaged Self-Repair toolchain/);
  assert.match(workflow,/test-packaged-admin-helper\.cjs/);
});


test('main-process owner presence gates protect privileged self-repair actions', () => {
  assert.match(main,/async function requireOwnerPresence/);
  assert.match(main,/jarvis:admin:start[\s\S]*requireOwnerPresence/);
  assert.match(main,/jarvis:self-repair:auto:run[\s\S]*requireOwnerPresence/);
  assert.match(main,/jarvis:self-repair:release:approve[\s\S]*requireOwnerPresence/);
  assert.match(main,/jarvis:developer:approve[\s\S]*requireOwnerPresence/);
  assert.match(main,/JARVIS_OWNER_ACTION_CANCELLED/);
});


test('crash Autopilot enablement is owner-presence gated', () => {
  assert.match(main,/jarvis:self-repair:auto:crash-mode[\s\S]*enabled === true[\s\S]*requireOwnerPresence/);
  assert.match(main,/Automatikus crash-javítás/);
});


test('bundled toolchain is prepended to PATH for npm child processes', () => {
  assert.match(main,/function withSelfRepairToolchainEnv/);
  assert.match(main,/\[toolchain\.root, existingPath\]/);
  assert.match(main,/PATH:toolchainPath/);
  assert.match(main,/runToolchainNpm[\s\S]*withSelfRepairToolchainEnv/);
});
