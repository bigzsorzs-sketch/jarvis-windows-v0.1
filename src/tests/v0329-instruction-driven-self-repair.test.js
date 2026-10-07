import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const repair=require('../../electron/developer-repair.cjs');
const main=fs.readFileSync('electron/main.cjs','utf8');
const preload=fs.readFileSync('electron/preload.cjs','utf8');
const system=fs.readFileSync('src/pages/SystemCenter.jsx','utf8');

test('v0.3.29 Self-Repair has no GitHub repair integration',()=>{
  assert.equal(fs.existsSync('electron/github-self-repair.cjs'),false);
  assert.doesNotMatch(main,/githubSelfRepair|GitHubSelfRepair|githubSelfRepairToken|jarvis:self-repair:github|createRepairPullRequest|GITHUB_PR_OPENED/);
  assert.doesNotMatch(preload,/self-repair:github|developerRepair:\s*\{[\s\S]*?github\s*:/);
  assert.doesNotMatch(system,/GitHub Self-Repair|github_pat_|Pull Request/);
});

test('v0.3.29 UI has no automatic Find bugs action',()=>{
  assert.match(system,/Self-Repair párbeszéd/);
  assert.match(system,/Írd le, mit szeretnél/);
  assert.doesNotMatch(system,/Hibák keresése|Find bugs/);
  assert.doesNotMatch(system,/Térképezd fel a programot, keress lehetséges hibákat/);
});

test('inspection and troubleshooting wording is non-mutating without an explicit change verb',()=>{
  for(const value of [
    'ellenőrizd a kódot',
    'nézd meg miért tűnik el a beszélgetés amikor visszalépek',
    'vizsgáld meg a mikrofon folyamatot',
    'miért nem működik a világos mód?'
  ]) assert.equal(repair.isExplicitRepairRequest(value),false,value);
});

test('explicit owner change wording creates a repair request',()=>{
  for(const value of [
    'javítsd meg a mikrofont',
    'töröld ezt a régi modult',
    'vedd ki ezt a gombot',
    'add hozzá ezt a funkciót',
    'építsd be ezt a változtatást',
    'implementáld ezt',
    'nézd meg és javítsd meg'
  ]) assert.equal(repair.isExplicitRepairRequest(value),true,value);
});

test('Self-Repair prompt follows owner request instead of initiating broad analysis',()=>{
  assert.match(main,/PRIMARY RULE: do exactly what the owner asks, and nothing broader/);
  assert.match(main,/Do not start a general bug search, project audit/);
  assert.match(main,/If the owner asks to inspect\/check, inspect only that scope/);
  assert.match(main,/If the owner describes a concrete problem, investigate that problem/);
  assert.match(main,/Code changes require the explicit Accept button/);
});

test('repaired runtime reuses the installed Jarvis user-data profile',()=>{
  assert.match(main,/MANUAL_REPAIR_USER_DATA_REQUIRED/);
  assert.match(main,/app\.setPath\('userData',manualUserData\)/);
  assert.match(main,/--jarvis-user-data=' \+ app\.getPath\('userData'\)/);
});

test('validated workspace fingerprint is rechecked before and during local runtime launch',()=>{
  assert.match(main,/runtimeFingerprint:manualRuntimeFingerprint\(workspace\)/);
  assert.match(main,/MANUAL_REPAIR_RUNTIME_FINGERPRINT_MISMATCH/);
  assert.match(main,/function validateManualRuntimeLaunch/);
  assert.match(main,/MANUAL_REPAIR_RUNTIME_NOT_VERIFIED/);
  assert.match(main,/if \(isManualRepairRuntime\) validateManualRuntimeLaunch\(\)/);
});

test('Accept uses validated local activation and restart',()=>{
  const start=main.indexOf("ipcMain.handle('jarvis:self-repair:manual:apply'");
  const end=main.indexOf("ipcMain.handle('jarvis:repair:apply'",start);
  const body=main.slice(start,end);
  assert.match(body,/await requireOwnerPresence/);
  assert.match(body,/developerRepair\.snapshotOwner/);
  assert.match(body,/await validateDirectOwnerRepair/);
  assert.match(body,/await ensureManualRuntimeBuilt/);
  assert.match(body,/scheduleManualRuntimeRestart\(entry\.workspace\)/);
  assert.match(body,/status:'APPLIED_AND_RESTARTING'/);
  assert.match(body,/developerRepair\.rollbackOwner\(entry\.workspace,backup\)/);
});
