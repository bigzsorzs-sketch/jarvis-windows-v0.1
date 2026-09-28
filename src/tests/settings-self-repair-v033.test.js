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
const app = fs.readFileSync('src/App.jsx','utf8');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
const client = fs.readFileSync('src/api/jarvisClient.js','utf8');
const owned = fs.readFileSync('src/lib/ownedEntityHelpers.js','utf8');

test('selected OpenRouter model is actually used instead of being forced back to auto', () => {
  assert.match(settings,/aiRoutingMode: selectedModel === 'openrouter\/auto' \? 'smart' : 'manual'/);
  assert.match(main,/const configuredModel = String\(raw\.aiModel/);
  assert.match(main,/const model = requestedModel\.includes\('\/'\)[\s\S]*?: configuredModel/);
});

test('voice settings expose selectable TTS model, gender and exact voice', () => {
  assert.match(settings,/speechModels\.map/);
  assert.match(settings,/Hang neme/);
  assert.match(settings,/Konkrét hang/);
  assert.match(settings,/changeVoiceModel/);
  assert.match(settings,/changeVoiceGender/);
  assert.match(settings,/changeVoice/);
  assert.match(settings,/Kore:'female'/);
  assert.match(settings,/Charon:'male'/);
  assert.match(main,/ttsGender/);
  assert.match(main,/ttsVoice/);
  assert.match(main,/supported_voices/);
  assert.match(main,/openrouter\.ai\/api\/v1\/models\?output_modalities=speech/);
});

test('light theme has a real independent palette and synchronizes native title bar', () => {
  assert.match(css,/:root \{[\s\S]*?--background: 210 40% 98%/);
  assert.match(css,/html\[data-theme="light"\] \.jarvis-reference-sidebar/);
  assert.match(theme,/window\.jarvisDesktop\?\.setTheme/);
  assert.match(preload,/setTheme:/);
  assert.match(main,/jarvis:theme:set/);
  assert.match(app,/subscribeTheme/);
  assert.match(app,/ThemeRuntime/);
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


test('installed builds include readable source for whole-program Self-Repair mapping', () => {
  assert.equal(pkg.build.files.includes('src/**/*'), true);
  assert.equal(pkg.build.files.includes('electron/**/*'), true);
  assert.match(main,/async function ensureManualRuntimeBuilt/);
  assert.match(main,/if \(!fs\.existsSync\(electronPath\)\)[\s\S]*runToolchainNpm\(\['ci'/);
});


test('settings persistence supports owned entity lookup before update', () => {
  assert.match(client,/async get\(rowId\)/);
  assert.match(client,/api\.filter\(entityName, \{ id: rowId \}, null, 1\)/);
  assert.match(owned,/ENTITY_NOT_FOUND/);
  assert.match(settings,/UserSettings\.filter\(\{ created_by: currentUser\.email \}, '-updated_date', 1\)/);
  assert.match(settings,/Jarvis settings save failed/);
});


test('manual Self-Repair workspace stays local and prepares runtime dependencies only for activation', () => {
  assert.match(main,/async function ensureManualRepairWorkspace/);
  assert.match(main,/manual-self-repair/);
  assert.equal(pkg.build.files.includes('src/**/*'), true);
  assert.equal(pkg.build.files.includes('electron/**/*'), true);
});

test('Self-Repair does not diagnose stale crashes from older app versions', () => {
  assert.match(system,/APP_VERSION/);
  assert.match(system,/currentVersionCrashes/);
  assert.match(system,/latestCurrentCrash/);
  assert.match(system,/nem elemzem aktuális hibaként/);
});


test('Self-Repair filters historical crashes inside the model prompt', () => {
  assert.match(main,/currentAppVersion = String\(app\.getVersion/);
  assert.match(main,/readRecentCrashes\(20\)[\s\S]*?filter\(\(item\) => String\(item\?\.appVersion/);
  assert.match(main,/Do not diagnose a historical crash from an older version as a current defect/);
});
