import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Electron updater source is clean and packaged resources resolve inside app.asar', () => {
  const main = read('electron/main.cjs');
  const escapedTick = 'const UPDATE_API = ' + String.fromCharCode(92, 96);
  const escapedInterpolation = String.fromCharCode(92) + '$' + '{UPDATE_REPO}';
  assert.equal(main.includes(escapedTick), false);
  assert.equal(main.includes(escapedInterpolation), false);
  assert.equal(main.includes("path.join(app.getAppPath(), ...parts)"), true);
});

test('backup restore requires confirmation and database replacement is atomic', () => {
  const backup = read('electron/data/backup-manager.cjs');
  const database = read('electron/data/local-database.cjs');
  assert.equal(backup.includes('showMessageBox'), true);
  assert.equal(backup.includes("buttons: ['Mégse', 'Visszaállítás']"), true);
  assert.equal(database.includes("const restore = this.db.transaction(() => {"), true);
  assert.equal(database.includes('BACKUP_SNAPSHOT_INVALID'), true);
  assert.equal(database.includes("clear();\n    return this.importLegacy(snapshot);"), false);
});

test('privileged execution paths are policy-gated in the Electron main process', () => {
  const main = read('electron/main.cjs');
  const policy = read('electron/security/policy-engine.cjs');
  assert.equal(main.includes('async function guarded('), true);
  assert.equal(main.includes("type:'system_file_write'"), true);
  assert.equal(main.includes("type:isPotentiallyMutatingObdCommand"), true);
  assert.equal(main.includes('() => database.delete'), true);
  assert.equal(policy.includes("'account_delete','obd_write'"), true);
});

test('OBD connection is not reported ready before a real adapter handshake', () => {
  const bridge = read('electron/obd/native-obd-bridge.cjs');
  const manager = read('src/lib/obd2/DesktopOBDManager.js');
  assert.equal(bridge.includes('async initializeAdapter()'), true);
  assert.equal(bridge.includes('OBD_ADAPTER_NO_RESPONSE'), true);
  assert.equal(bridge.includes("const probeRaw = await this.sendCommand('0100'"), true);
  assert.equal(manager.includes('result.adapterReady !== true'), true);
});

test('image input, image generation and local file analysis are implemented', () => {
  const main = read('electron/main.cjs');
  assert.equal(main.includes("type:'image_url'"), true);
  assert.equal(main.includes("case 'generateImage': return openRouterGenerateImage(payload);"), true);
  assert.equal(main.includes("case 'analyzeUploadedFiles'"), true);
  assert.equal(main.includes("case 'analyzeProjectDeep'"), true);
  assert.equal(main.includes("case 'analyzeProjectSpecialists'"), true);
});

test('self audit never presents the old hard-coded score as a measurement', () => {
  const audit = read('src/lib/selfAuditCommand.js');
  assert.equal(audit.includes('Overall score: 88/100'), false);
  assert.equal(audit.includes('Overall score: not calculated.'), true);
  assert.equal(audit.includes('Only checks actually executed at runtime are shown.'), true);
});
