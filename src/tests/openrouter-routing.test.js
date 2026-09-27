import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync('electron/main.cjs', 'utf8');
const preload = fs.readFileSync('electron/preload.cjs', 'utf8');
const settings = fs.readFileSync('src/pages/Settings.jsx', 'utf8');
const chat = fs.readFileSync('src/lib/chatOrchestrator.js', 'utf8');
const codeAssistant = fs.readFileSync('src/lib/codeAssistant.js', 'utf8');

test('OpenRouter smart routing uses auto router and reports usage/cost', () => {
  assert.match(main, /openrouter\/auto/);
  assert.match(main, /cost_tier/);
  assert.match(main, /usage:\{ include:true \}/);
  assert.match(main, /json\?\.usage\?\.cost/);
});

test('normal chat and coding no longer hard-code obsolete model aliases', () => {
  assert.doesNotMatch(chat, /gemini_3_flash/);
  assert.doesNotMatch(codeAssistant, /gemini_3_flash/);
  assert.match(chat, /task_type: 'general'/);
  assert.match(codeAssistant, /task_type: 'coding'/);
});

test('candidate OpenRouter key is validated before it is persisted', () => {
  assert.match(main, /testOpenRouterConnection\(candidateApiKey\)/);
  assert.match(main, /if \(candidateApiKey\) await saveSettingsInternal/);
  assert.match(preload, /testAiConnection: \(apiKey = ''\)/);
  assert.match(settings, /testAiConnection\(candidateKey\)/);
});

test('normal AI text and attachments do not trigger confirmation popup', () => {
  assert.match(main, /transmitsSensitiveData:false/);
});

test('AI self-repair remains allowlisted and does not modify the API key', () => {
  assert.match(main, /repair-ai-session/);
  assert.match(main, /await session\.defaultSession\.clearCache\(\)/);
  assert.match(main, /await testOpenRouterConnection\(\)/);
  const repairCase = main.slice(main.indexOf("case 'repair-ai-session'"), main.indexOf("case 'repair-ai-session'") + 300);
  assert.doesNotMatch(repairCase, /saveSettingsInternal|openRouterApiKey|delete raw\.openRouterKey/);
});

test('OpenRouter connection test is exposed in Settings UI', () => {
  assert.match(main, /jarvis:ai:test-connection/);
  assert.match(preload, /testAiConnection/);
  assert.match(settings, /Kapcsolat tesztelése/);
  assert.match(settings, /type="password"/);
});
