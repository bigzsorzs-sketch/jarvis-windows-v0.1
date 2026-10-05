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
const githubRepair = fs.readFileSync('electron/github-self-repair.cjs','utf8');
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
  assert.match(main,/readRecentCrashes\(20\)[\s\S]*?filter\(\(item\) => canonicalAppVersion\(item\?\.appVersion\)/);
  assert.match(main,/Do not diagnose a historical crash from an older version as a current defect/);
});


test('GitHub Self-Repair token is encrypted locally and never exposed through renderer settings', () => {
  assert.match(main,/githubSelfRepairToken/);
  assert.match(main,/protectSecret\(token\)/);
  assert.match(main,/unprotectSecret\(raw\.githubSelfRepairToken\)/);
  assert.match(main,/hasGitHubSelfRepairToken/);
  assert.doesNotMatch(preload,/githubSelfRepairToken/);
  assert.match(preload,/jarvis:self-repair:github:connect/);
  assert.match(preload,/jarvis:self-repair:github:disconnect/);
});

test('GitHub Self-Repair only targets the pinned Jarvis repository and protects release infrastructure from AI patches', () => {
  assert.match(githubRepair,/DEFAULT_REPO = 'bigzsorzs-sketch\/jarvis-windows-v0\.1'/);
  assert.match(githubRepair,/GITHUB_REPOSITORY_NOT_ALLOWED/);
  assert.match(githubRepair,/GITHUB_REPAIR_PATH_BLOCKED/);
  assert.match(githubRepair,/\.github\\\/workflows/);
  assert.match(githubRepair,/scripts\\\//);
  assert.match(githubRepair,/GITHUB_REPAIR_REMOTE_SOURCE_CHANGED/);
});

test('Self-Repair requires local full validation before GitHub PR creation and keeps merge and release as owner actions', () => {
  const start = main.indexOf("ipcMain.handle('jarvis:self-repair:manual:apply'");
  const end = main.indexOf("ipcMain.handle('jarvis:repair:apply'",start);
  const body = main.slice(start,end);
  assert.ok(start >= 0 && end > start);
  assert.ok(body.indexOf('await ensureManualRuntimeBuilt') < body.indexOf('await client.createRepairPullRequest'));
  assert.ok(body.indexOf('developerRepair.rollbackOwner(entry.workspace,backup)') < body.indexOf('await client.createRepairPullRequest'));
  assert.match(main,/async function mergeGitHubSelfRepair/);
  assert.match(main,/async function publishGitHubSelfRepairRelease/);
  assert.match(githubRepair,/GITHUB_REPAIR_CI_NOT_PASSED/);
  assert.match(githubRepair,/GITHUB_RELEASE_MAIN_CI_NOT_PASSED/);
});


test('GitHub merge release and abandon require native owner presence only after their verification preconditions', () => {
  for (const [name,gate] of [
    ['mergeGitHubSelfRepair',"state.prStatus?.ci?.state !== 'passed'"],
    ['publishGitHubSelfRepairRelease',"state.mainStatus?.state !== 'current'"],
    ['abandonGitHubSelfRepair',"state.mergeSha || state.phase === 'merged'"]
  ]) {
    const start=main.indexOf(`async function ${name}`);
    assert.ok(start>=0,name);
    const next=main.indexOf('\nasync function ',start+20);
    const body=main.slice(start,next>start?next:main.length);
    const gateIndex=body.indexOf(gate);
    const confirmIndex=body.indexOf('await requireOwnerPresence');
    assert.ok(gateIndex>=0,`${name}: missing verification gate`);
    assert.ok(confirmIndex>gateIndex,`${name}: native confirmation must follow verification gate`);
  }
});
