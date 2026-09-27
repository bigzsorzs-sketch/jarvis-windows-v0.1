import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync('electron/main.cjs', 'utf8');
const preload = fs.readFileSync('electron/preload.cjs', 'utf8');
const settings = fs.readFileSync('src/pages/Settings.jsx', 'utf8');

test('OpenRouter smart routing keeps secrets in safeStorage and reports usage', () => {
  assert.match(main, /protectSecret\(patch\.openRouterApiKey\.trim\(\)\)/);
  assert.match(main, /usage:\{ include:true \}/);
  assert.match(main, /json\?\.usage\?\.cost/);
  assert.match(main, /openrouter\/auto/);
  assert.match(main, /cost_tier/);
});

test('OpenRouter connection test is exposed through preload and settings UI', () => {
  assert.match(main, /jarvis:ai:test-connection/);
  assert.match(preload, /testAiConnection/);
  assert.match(settings, /Kapcsolat tesztelése/);
  assert.match(settings, /type="password"/);
});
