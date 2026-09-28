import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repair = require('../../electron/developer-repair.cjs');
const read = (file) => fs.readFileSync(file, 'utf8');

test('Self-Repair packages the workflow required by sandbox regression tests', () => {
  const pkg = JSON.parse(read('package.json'));
  const stage = read('scripts/stage-self-repair-toolchain.cjs');
  const packagedCheck = read('scripts/test-packaged-toolchain.cjs');
  assert.equal(stage.includes('self-development-build-windows.yml'), true);
  assert.equal(
    pkg.build.extraResources.some((entry) =>
      entry.from === 'build/self-development-build-windows.yml' &&
      entry.to === 'self-development-source/.github/workflows/build-windows.yml'
    ),
    true
  );
  assert.equal(packagedCheck.includes('PACKAGED_SELF_REPAIR_WORKFLOW_MISSING'), true);
  assert.equal(packagedCheck.includes('PACKAGED_SELF_REPAIR_WORKFLOW_INVALID'), true);
});

test('developer validation preflights the complete sandbox before running tests', () => {
  const main = read('electron/main.cjs');
  assert.equal(main.includes("'.github/workflows/build-windows.yml'"), true);
  assert.equal(main.includes("'validation workspace preflight'"), true);
  assert.equal(main.includes('AUTONOMOUS_REPAIR_VALIDATION_SOURCE_MISSING'), true);
});

test('protected-path failures identify the exact file and planner treats protected source as read-only', () => {
  assert.throws(
    () => repair.validatePlan(process.cwd(), { patches:[{ file:'electron/main.cjs', content:'x' }] }),
    /DEV_REPAIR_PROTECTED_PATH:electron\/main\.cjs/
  );
  const main = read('electron/main.cjs');
  assert.equal(main.includes('PROTECTED READ-ONLY'), true);
  assert.equal(main.includes('OWNER_CORE_REPAIR_REQUIRED:'), true);
  assert.equal(main.includes('Do not propose that file again.'), true);
});

test('release version is synchronized', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const appVersion = read('src/lib/appVersion.js');
  assert.equal(typeof pkg.version, 'string');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(appVersion.includes(`APP_VERSION = '${pkg.version}'`), true);
});
