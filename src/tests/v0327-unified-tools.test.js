import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recognizeIntent } from '../lib/aiIntentEngine.js';

test('v0.3.27 preserves decimal blood sugar values', () => {
  const intent = recognizeIntent('rögzíts 5,5 vércukrot');
  assert.equal(intent.handled, true);
  assert.equal(intent.tool, 'log_blood_sugar');
  assert.equal(intent.params.value, 5.5);
});

test('v0.3.27 reads glucose only for explicit glucose requests', () => {
  assert.equal(recognizeIntent('mi a vércukrom?').tool, 'read_latest_blood_sugar');
  assert.equal(recognizeIntent('mi a vérnyomásom?').handled, false);
});

test('v0.3.27 map intent does not hijack generic open commands', () => {
  const map = recognizeIntent('nyisd meg a térképet Leeds');
  assert.equal(map.tool, 'open_map');
  assert.match(map.params.destination, /Leeds/i);
  assert.equal(recognizeIntent('nyisd meg a beállításokat').handled, false);
});

test('sensitive tools are not executed by deterministic shortcut routing', () => {
  assert.equal(recognizeIntent('hívj Pétert').handled, false);
  assert.equal(recognizeIntent('készíts számlát és küldd emailben').handled, false);
  assert.equal(recognizeIntent('kapcsold fel a lámpát').handled, false);
});

test('stable v0.3.26 capabilities remain present', () => {
  const tools = fs.readFileSync('src/lib/assistantTools.js','utf8');
  for (const token of ['log_meal:', 'log_finance:', 'optimize_workload:', 'optimize_revenue:', 'buildSystemPrompt']) {
    assert.equal(tools.includes(token), true, `missing stable capability: ${token}`);
  }
  assert.equal(tools.includes('£'), true);
});

test('voice execution uses the guarded action executor', () => {
  const voice = fs.readFileSync('src/lib/globalVoiceActions.js','utf8');
  assert.match(voice, /executeActions/);
  assert.match(voice, /await executeActions\(actions, \{ source:'voice', goal:text \}\)/);
  const registry = fs.readFileSync('src/lib/capabilityRegistry.js','utf8');
  assert.match(registry, /create_invoice_and_email'.*approval:'confirm'/);
  assert.match(registry, /control_device'.*approval:'confirm'/);
});

test('Live Assistant routes typed and spoken commands through unified execution', () => {
  const live = fs.readFileSync('src/pages/LiveAssistant.jsx','utf8');
  assert.match(live, /source: source === 'voice' \? 'voice' : 'live'/);
});
