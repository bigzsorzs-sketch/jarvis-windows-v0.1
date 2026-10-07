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
  assert.match(main,/ttsGender/);
  assert.match(main,/ttsVoice/);
  assert.match(main,/supported_voices/);
});

test('light theme has a real independent palette and synchronizes native title bar', () => {
  assert.match(css,/:root \{[\s\S]*?--background: 210 40% 98%/);
  assert.match(css,/html\[data-theme="light"\] \.jarvis-reference-sidebar/);
  assert.match(theme,/window\.jarvisDesktop\?\.setTheme/);
  assert.match(preload,/setTheme:/);
  assert.match(main,/jarvis:theme:set/);
  assert.match(app,/subscribeTheme/);
});

test('desktop navigation uses app language instead of hard-coded English labels', () => {
  assert.match(layout,/label: t\('home'\)/);
  assert.match(layout,/label: t\('tasks'\)/);
  assert.match(layout,/label: t\('page_automotive'\)/);
});

test('Self-Repair is owner-instruction driven instead of unsolicited bug hunting', () => {
  assert.match(repair,/function buildDiagnosticContext/);
  assert.match(main,/function selfRepairRequestMode/);
  assert.match(main,/PRIMARY RULE: do exactly what the owner asks/);
  assert.match(main,/Do not start a general bug search/);
  assert.match(system,/Self-Repair párbeszéd/);
  assert.match(system,/csak azt vizsgálja, magyarázza vagy módosítja/);
  assert.match(system,/sendSelfRepairMessage/);
  assert.doesNotMatch(system,/Hibák keresése|Find bugs/);
});

test('installed builds include readable source and run the full local Self-Repair validation gate', () => {
  assert.equal(pkg.build.files.includes('src/**/*'), true);
  assert.equal(pkg.build.files.includes('electron/**/*'), true);
  const start = main.indexOf('async function ensureManualRuntimeBuilt(');
  const end = main.indexOf('function crashLogPath(',start);
  const body = main.slice(start,end);
  assert.ok(start >= 0 && end > start);
  for (const step of [
    "runToolchainNpm(['ci','--no-audit','--no-fund']",
    "runToolchainNode(['scripts/audit-all-source.cjs']",
    "await checkNpm('lint')",
    "await checkNpm('typecheck')",
    "await checkNpm('verify:jarvis')",
    "await runToolchainNode(['--test',...testFiles]",
    "await checkNpm('build')",
    "writeJson(manualRuntimeStatePath(),state)"
  ]) assert.ok(body.includes(step),step);
});

test('settings persistence supports owned entity lookup before update', () => {
  assert.match(client,/async get\(rowId\)/);
  assert.match(client,/api\.filter\(entityName, \{ id: rowId \}, null, 1\)/);
  assert.match(owned,/ENTITY_NOT_FOUND/);
  assert.match(settings,/UserSettings\.filter\(\{ created_by: currentUser\.email \}, '-updated_date', 1\)/);
});

test('Self-Repair does not diagnose stale crashes from older app versions', () => {
  assert.match(system,/APP_VERSION/);
  assert.match(system,/currentVersionCrashes/);
  assert.match(system,/latestCurrentCrash/);
  assert.match(system,/nem elemzem aktuális hibaként/);
  assert.match(main,/currentAppVersion = String\(app\.getVersion/);
});

test('GitHub Self-Repair UI credentials IPC and module are completely absent', () => {
  assert.doesNotMatch(main,/githubSelfRepair|GitHubSelfRepair|githubSelfRepairToken|jarvis:self-repair:github/);
  assert.doesNotMatch(preload,/developerRepair:\s*\{[\s\S]*?github\s*:/);
  assert.doesNotMatch(system,/GitHub Self-Repair|github_pat_|developerRepair\?\.github/);
  assert.equal(fs.existsSync('electron/github-self-repair.cjs'),false);
});

test('Accept performs validated local activation and schedules restart', () => {
  const start=main.indexOf("ipcMain.handle('jarvis:self-repair:manual:apply'");
  const end=main.indexOf("ipcMain.handle('jarvis:repair:apply'",start);
  const body=main.slice(start,end);
  assert.ok(start>=0 && end>start);
  const sequence=[
    'loadPersistedManualRepairPlan(hash)',
    'await requireOwnerPresence',
    'developerRepair.snapshotOwner',
    'developerRepair.applyOwner',
    'developerRepair.normalizeOwnerPlanFiles',
    'await validateDirectOwnerRepair',
    'await ensureManualRuntimeBuilt',
    'scheduleManualRuntimeRestart(entry.workspace)'
  ];
  let previous=-1;
  for(const item of sequence){
    const index=body.indexOf(item,previous+1);
    assert.ok(index>previous,item);
    previous=index;
  }
  assert.match(body,/status:'APPLIED_AND_RESTARTING'/);
  assert.match(body,/developerRepair\.rollbackOwner\(entry\.workspace,backup\)/);
  assert.doesNotMatch(body,/GitHub|Pull Request|createRepairPullRequest/);
});
