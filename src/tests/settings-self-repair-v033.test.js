import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const settings = fs.readFileSync('src/pages/Beallitasok.jsx','utf8');
const theme = fs.readFileSync('src/lib/themeManager.js','utf8');
const css = fs.readFileSync('src/index.css','utf8');
const layout = fs.readFileSync('src/components/Layout.jsx','utf8');
const main = fs.readFileSync('electron/main.cjs','utf8');
const preload = fs.readFileSync('electron/preload.cjs','utf8');
const repair = fs.readFileSync('electron/developer-repair.cjs','utf8');
const system = fs.readFileSync('src/pages/SystemCenter.jsx','utf8');

test('selected OpenRouter model is actually used instead of being forced back to auto', () => {
  assert.match(settings,/aiRoutingMode: selectedModel === 'openrouter\/auto' \? 'smart' : 'manual'/);
  assert.match(main,/const configuredModel = String\(raw\.aiModel/);
  assert.match(main,/const model = requestedModel\.includes\('\/'\)[\s\S]*?: configuredModel/);
});

test('voice settings expose TTS model and male or female voice choice', () => {
  assert.match(settings,/Gemini 3\.8 Flash TTS/);
  assert.match(settings,/Férfi – Charon/);
  assert.match(settings,/Női – Kore/);
  assert.match(main,/ttsGender/);
  assert.match(main,/patch\.ttsGender === 'female' \? 'Kore' : 'Charon'/);
});

test('light theme has a real independent palette and synchronizes native title bar', () => {
  assert.match(css,/:root \{[\s\S]*?--background: 210 40% 98%/);
  assert.match(css,/html\[data-theme="light"\] \.jarvis-reference-sidebar/);
  assert.match(theme,/window\.jarvisDesktop\?\.setTheme/);
  assert.match(preload,/setTheme:/);
  assert.match(main,/jarvis:theme:set/);
});

test('desktop navigation uses app language instead of hard-coded English labels', () => {
  assert.match(layout,/label: t\('home'\)/);
  assert.match(layout,/label: t\('tasks'\)/);
  assert.match(layout,/label: t\('page_automotive'\)/);
  assert.match(layout,/lang === 'hu' \? 'Rendszerközpont'/);
});

test('self repair maps architecture, retrieves relevant source and supports conversation', () => {
  assert.match(repair,/function inspectWorkspace/);
  assert.match(repair,/function buildDiagnosticContext/);
  assert.match(main,/case 'selfRepairMap'/);
  assert.match(main,/case 'selfRepairChat'/);
  assert.match(main,/reason about architecture, imports, state flow, IPC boundaries/);
  assert.match(system,/Self-Repair párbeszéd/);
  assert.match(system,/Program feltérképezése/);
  assert.match(system,/Hibák keresése/);
  assert.match(system,/sendSelfRepairMessage/);
});
