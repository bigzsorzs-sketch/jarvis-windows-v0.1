import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');

test('Autopilot workspace never lives in Documents or OneDrive', () => {
  const main = read('electron/main.cjs');
  assert.equal(main.includes("app.getPath('documents'),'Jarvis Self-Development'"), false);
  assert.equal(main.includes("app.getPath('userData'),'self-development-workspaces'"), true);
});

test('Autopilot workspace is versioned and stale state is updated when prepared', () => {
  const main = read('electron/main.cjs');
  assert.equal(main.includes("const safeVersion = String(app.getVersion?.() || 'current')"), true);
  assert.equal(main.includes('state.workspace !== workspace'), true);
  assert.equal(main.includes("status:state.status === 'INTERRUPTED' ? 'IDLE' : state.status"), true);
});

test('release version remains synchronized after v0.3.13', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const appVersion = read('src/lib/appVersion.js');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(appVersion.includes(`APP_VERSION = '${pkg.version}'`), true);
});
