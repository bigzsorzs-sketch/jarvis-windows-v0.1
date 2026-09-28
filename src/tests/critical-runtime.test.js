import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LocalDatabase } = require('../../electron/data/local-database.cjs');
const { NativeObdBridge } = require('../../electron/obd/native-obd-bridge.cjs');
const { analyzeUploadedFiles, analyzeProjectSpecialists } = require('../../electron/analysis/file-analyzer.cjs');
const { PolicyEngine } = require('../../electron/security/policy-engine.cjs');

test('failed snapshot restore rolls back and preserves the previous database', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-db-test-'));
  const db = new LocalDatabase(path.join(dir, 'jarvis.sqlite3'));
  try {
    db.create('Note', { id: 'keep-me', text: 'original' });
    assert.throws(() => db.importSnapshot({
      entities: { Note: [{ id: 'new-row', text: 'replacement' }, null] }
    }), /BACKUP_ENTITY_ROW_INVALID/);
    const rows = db.filter('Note');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'keep-me');
    assert.equal(rows[0].text, 'original');
    assert.equal(db.stats().integrity, 'ok');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('OBD initialization rejects an adapter that returns no data', async () => {
  const bridge = new NativeObdBridge();
  bridge.sendCommand = async () => '';
  await assert.rejects(() => bridge.initializeAdapter(), /OBD_ADAPTER_NO_RESPONSE/);
});

test('OBD initialization distinguishes adapter readiness from ECU response', async () => {
  const bridge = new NativeObdBridge();
  bridge.sendCommand = async (command) => {
    if (command === 'ATZ') return 'ELM327 v1.5\r>';
    if (command === '0100') return 'NO DATA\r>';
    return 'OK\r>';
  };
  const result = await bridge.initializeAdapter();
  assert.equal(result.adapterReady, true);
  assert.equal(result.ecuConnected, false);
});

test('local uploaded source analysis reads actual supplied content', () => {
  const source = "const password = 'not-a-real-test-secret-123';\nTODO: add tests\n";
  const url = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const result = analyzeUploadedFiles([{ name: 'app.js', kind: 'code', url }]);
  assert.equal(result.analyses.length, 1);
  assert.equal(result.analyses[0].extracted_files[0].content.includes('TODO'), true);

  const specialists = analyzeProjectSpecialists([{ name: 'app.js', kind: 'code', url }]);
  assert.equal(specialists.measured, true);
  assert.equal(specialists.note.includes('not a hard-coded self-rating'), true);
});


test('owner override token is action-bound and consumed exactly once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-policy-test-'));
  try {
    const policy = new PolicyEngine({
      rulesPath: path.join(process.cwd(), 'security/core-rules.json'),
      signaturePath: path.join(process.cwd(), 'security/core-rules.sig'),
      publicKeyPath: path.join(process.cwd(), 'security/core-rules-public.pem'),
      auditPath: path.join(dir, 'audit.jsonl'),
      pinVerifierPath: path.join(dir, 'owner-pin.json'),
    });
    policy.setOwnerPin('2162');
    const action = { type:'system_file_write', target:'C:\\Temp\\test.txt', authorised:true };
    const grant = policy.requestOverride({ ruleId:'RULE-08', pin:'2162', action });
    assert.equal(grant.ok, true);
    assert.equal(typeof grant.token, 'string');
    assert.equal(policy.consumeOverride(grant.token, action), true);
    assert.equal(policy.consumeOverride(grant.token, action), false);

    const second = policy.requestOverride({ ruleId:'RULE-08', pin:'2162', action });
    assert.equal(second.ok, true);
    assert.equal(policy.consumeOverride(second.token, { ...action, target:'C:\\Temp\\other.txt' }), false);
  } finally {
    fs.rmSync(dir, { recursive:true, force:true });
  }
});


test('desktop media permission policy allows trusted microphone but rejects camera', () => {
  const main = fs.readFileSync('electron/main.cjs', 'utf8');
  assert.match(main,/function configureMediaPermissions/);
  assert.match(main,/setPermissionCheckHandler/);
  assert.match(main,/setPermissionRequestHandler/);
  assert.match(main,/requestsVideo/);
  assert.match(main,/requestsAudio/);
  assert.match(main,/configureMediaPermissions\(mainWindow\)/);
});
