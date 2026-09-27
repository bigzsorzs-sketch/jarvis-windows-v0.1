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

test('API secrets are never stored with a plaintext/base64 fallback', () => {
  const main = read('electron/main.cjs');
  assert.equal(main.includes('plain-local-fallback'), false);
  assert.equal(main.includes('WINDOWS_SECURE_STORAGE_UNAVAILABLE'), true);
  assert.equal(main.includes("entry.type !== 'safeStorage'"), true);
});

test('Jarvis application does not request permanent administrator privileges', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.build?.win?.requestedExecutionLevel, 'asInvoker');
  assert.equal(pkg.build?.nsis?.perMachine, true);
});

test('legacy insecure API key fallback is purged during startup', () => {
  const main = read('electron/main.cjs');
  assert.equal(main.includes('function purgeInsecureLegacySecrets()'), true);
  assert.equal(main.includes("raw.openRouterKey.type !== 'safeStorage'"), true);
  assert.equal(main.includes('purgeInsecureLegacySecrets();'), true);
  assert.equal(main.includes('hasSecureOpenRouterKey'), true);
});

test('sensitive text context is policy-confirmed before external AI transmission', () => {
  const main = read('electron/main.cjs');
  const chat = read('src/lib/chatOrchestrator.js');
  assert.equal(main.includes('function payloadContainsSensitiveContext'), true);
  assert.equal(main.includes('transmitsSensitiveData:hasExternalImages || sendsSensitiveText'), true);
  assert.equal(chat.includes('contains_sensitive_context: containsSensitiveContext'), true);
});

test('account deletion erases local stores instead of only clearing SQLite rows', () => {
  const main = read('electron/main.cjs');
  assert.equal(main.includes('async function deleteAllLocalData()'), true);
  assert.equal(main.includes("path.join(userData, 'audit')"), true);
  assert.equal(main.includes("path.join(userData, 'security')"), true);
  assert.equal(main.includes('session.defaultSession.clearStorageData()'), true);
  assert.equal(main.includes("path.join(app.getPath('documents'), 'Jarvis Backups')"), true);
});

test('owner override uses a local salted verifier and one-time action-bound token', () => {
  const policy = read('electron/security/policy-engine.cjs');
  assert.equal(policy.includes('PIN_HASH_HEX'), false);
  assert.equal(policy.includes('crypto.randomBytes(32)'), true);
  assert.equal(policy.includes('this.overrideTokens.set(token'), true);
  assert.equal(policy.includes('consumeOverride(token, action)'), true);
  assert.equal(policy.includes('OVERRIDE_NOT_APPLICABLE_TO_ACTION'), true);
});

test('previously missing desktop functions no longer fall into NOT_IMPLEMENTED', () => {
  const main = read('electron/main.cjs');
  for (const name of ['generateOBDDiagnosis','getAiFeedbackAdminData','createPromptTuning','updatePromptTuning','transcribeVoice','synthesizeVoice','gmailSend']) {
    assert.equal(main.includes(`case '${name}'`), true, name);
  }
});

test('fake multi-user, cloud and unconfigured recorded voice paths are disabled', () => {
  const client = read('src/api/jarvisClient.js');
  const preload = read('electron/preload.cjs');
  const cloud = read('src/components/settings/SecurityCloudCards.jsx');
  assert.equal(client.includes("throw new Error('LOCAL_SINGLE_OWNER_MODE')"), true);
  assert.equal(preload.includes('recordedStt:false'), true);
  assert.equal(preload.includes('gmailOAuth:false'), true);
  assert.equal(cloud.includes('felhőszinkron nincs engedélyezve'), true);
});

test('one-click updater verifies installer signer identity in addition to SHA-256', () => {
  const main = read('electron/main.cjs');
  assert.equal(main.includes('verifyUpdateSigner(installerPath)'), true);
  assert.equal(main.includes('UPDATE_SIGNER_UNVERIFIED'), true);
  assert.equal(main.includes('UPDATE_SIGNER_MISMATCH'), true);
});

test('production dependency policy removes known vulnerable Quill path and gates moderate audit', () => {
  const pkg = JSON.parse(read('package.json'));
  const workflow = read('.github/workflows/build-windows.yml');
  assert.equal(Boolean(pkg.dependencies?.['react-quill']), false);
  assert.equal(pkg.dependencies?.['react-router-dom'], '7.18.4');
  assert.equal(workflow.includes('npm audit --omit=dev --audit-level=moderate'), true);
});

test('displayed app version matches package release version and no permanent elevation is expected', () => {
  const pkg = JSON.parse(read('package.json'));
  const versionSource = read('src/lib/appVersion.js');
  const main = read('electron/main.cjs');
  assert.equal(versionSource.includes(`APP_VERSION = '${pkg.version}'`), true);
  assert.equal(main.includes('elevatedExpected:false'), true);
});

test('misleading implementation and random scan UI markers are gone', () => {
  const upgrade = read('src/pages/UpgradeCenter.jsx');
  const scanner = read('src/pages/OBD2Scanner.jsx');
  assert.equal(upgrade.includes("updateStatus(proposal.id, 'implemented')"), false);
  assert.equal(scanner.includes('Math.random().toString().slice(-2)'), false);
  assert.equal(scanner.includes('scanProgress'), true);
});

test('Smart Home does not mutate stored device status after an unverified physical command', () => {
  const env = read('src/lib/environmentTools.js');
  const failureIndex = env.indexOf('if (!apiResult)');
  const updateIndex = env.indexOf("jarvis.entities.SmartDevice.update(device.id");
  assert.equal(failureIndex >= 0, true);
  assert.equal(updateIndex > failureIndex, true);
  assert.equal(env.includes('real_control:false, verified:false'), true);
});

