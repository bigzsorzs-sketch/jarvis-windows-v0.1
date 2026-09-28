import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');

test('packaged Self-Repair carries the complete package.json outside app.asar', () => {
  const pkg = JSON.parse(read('package.json'));
  const resource = (pkg.build?.extraResources || []).find((item) =>
    item?.from === 'package.json' && item?.to === 'self-development-source/package.json'
  );
  assert.ok(resource);
  assert.ok(Array.isArray(pkg.build?.files));
  assert.ok(pkg.build.files.includes('src/**/*'));
  assert.ok(pkg.build.files.includes('electron/**/*'));
});

test('Autopilot refuses incomplete package metadata before sandbox validation', () => {
  const main = read('electron/main.cjs');
  assert.equal(main.includes('AUTONOMOUS_REPAIR_SOURCE_PACKAGE_MISSING'), true);
  assert.equal(main.includes('AUTONOMOUS_REPAIR_PACKAGE_METADATA_INCOMPLETE'), true);
  assert.equal(main.includes('AUTONOMOUS_REPAIR_PACKAGE_VERSION_MISMATCH'), true);
  assert.equal(main.includes("entry === 'package.json' || entry === 'package-lock.json'"), true);
});

test('v0.3.14 version is synchronized', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const appVersion = read('src/lib/appVersion.js');
  assert.equal(pkg.version, '0.3.14');
  assert.equal(lock.version, '0.3.14');
  assert.equal(lock.packages[''].version, '0.3.14');
  assert.equal(appVersion.includes("APP_VERSION = '0.3.14'"), true);
});
