import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const settings = fs.readFileSync('src/pages/Beallitasok.jsx','utf8');
const main = fs.readFileSync('electron/main.cjs','utf8');
const preload = fs.readFileSync('electron/preload.cjs','utf8');
const repair = fs.readFileSync('electron/developer-repair.cjs','utf8');
const system = fs.readFileSync('src/pages/SystemCenter.jsx','utf8');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));

test('Self-Repair is owner-instruction driven instead of an unsolicited bug hunter', () => {
  assert.match(repair,/function buildDiagnosticContext/);
  assert.match(main,/function selfRepairRequestMode/);
  assert.match(main,/PRIMARY RULE: do exactly what the owner asks/);
  assert.match(main,/Do not start a general bug search/);
  assert.match(system,/Self-Repair párbeszéd/);
  assert.match(system,/csak azt vizsgálja, magyarázza vagy módosítja/);
  assert.doesNotMatch(system,/Hibák keresése|Find bugs/);
});

test('direct owner change verbs are recognized while inspection remains a separate mode', () => {
  const developerRepair = require('../../electron/developer-repair.cjs');
  for (const phrase of ['javítsd meg','töröld','vedd ki','add hozzá','építsd be','cseréld','implementáld']) {
    assert.equal(developerRepair.isExplicitRepairRequest(phrase),true,phrase);
  }
  for (const phrase of ['ellenőrizd a kódot','nézd meg miért tűnik el a beszélgetés','magyarázd el ezt a részt']) {
    assert.equal(developerRepair.isExplicitRepairRequest(phrase),false,phrase);
  }
  assert.match(main,/return 'inspect'/);
  assert.match(main,/return 'troubleshoot'/);
  assert.match(main,/return 'answer'/);
});

test('GitHub Self-Repair UI credentials IPC and module are completely absent', () => {
  assert.doesNotMatch(main,/githubSelfRepair|GitHubSelfRepair|githubSelfRepairToken|jarvis:self-repair:github/);
  assert.doesNotMatch(preload,/jarvis:self-repair:github|developerRepair:\s*\{[\s\S]*?github\s*:/);
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

test('installed Self-Repair keeps full local validation before activation', () => {
  assert.equal(pkg.build.files.includes('src/**/*'),true);
  assert.equal(pkg.build.files.includes('electron/**/*'),true);
  const start=main.indexOf('async function ensureManualRuntimeBuilt(');
  const end=main.indexOf('function clearLegacyManualRuntimeState(',start);
  const body=main.slice(start,end);
  for(const step of [
    "runToolchainNpm(['ci','--no-audit','--no-fund']",
    "runToolchainNode(['scripts/audit-all-source.cjs']",
    "await checkNpm('lint')",
    "await checkNpm('typecheck')",
    "await checkNpm('verify:jarvis')",
    "await runToolchainNode(['--test',...testFiles]",
    "await checkNpm('build')",
    'writeJson(manualRuntimeStatePath(),state)'
  ]) assert.ok(body.includes(step),step);
  assert.ok(body.indexOf("await checkNpm('build')") < body.indexOf('writeJson(manualRuntimeStatePath(),state)'));
});

test('ordinary OpenRouter and voice settings remain available', () => {
  assert.match(settings,/aiRoutingMode/);
  assert.match(main,/openRouterKey/);
  assert.match(main,/ttsVoice/);
});
