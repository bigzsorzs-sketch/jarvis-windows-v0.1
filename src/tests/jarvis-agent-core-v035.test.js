import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  getApprovalMode,
  getVoiceRouteAliases,
  listToolCapabilities,
  syncDiscoveredTools,
} from '../lib/capabilityRegistry.js';
import { extractWakeWordCommand } from '../lib/wakeWord.js';

const assistantTools = fs.readFileSync('src/lib/assistantTools.js','utf8');
const router = fs.readFileSync('src/lib/CommandRouter.js','utf8');
const agent = fs.readFileSync('src/lib/agentOrchestrator.js','utf8');
const memory = fs.readFileSync('src/lib/agentMemory.js','utf8');
const voiceRuntime = fs.readFileSync('src/lib/voiceRuntime.js','utf8');
const settings = fs.readFileSync('src/pages/Beallitasok.jsx','utf8');
const globalVoice = fs.readFileSync('src/components/voice/GlobalVoiceControl.jsx','utf8');
const voiceStage = fs.readFileSync('src/components/command-center/JarvisVoiceStage.jsx','utf8');
const system = fs.readFileSync('src/pages/SystemCenter.jsx','utf8');
const electronMain = fs.readFileSync('electron/main.cjs','utf8');
const preload = fs.readFileSync('electron/preload.cjs','utf8');
const rendererMain = fs.readFileSync('src/main.jsx','utf8');
const workflow = fs.readFileSync('.github/workflows/build-windows.yml','utf8');

test('capability registry exposes app routes and explicit safety levels', () => {
  const routes = getVoiceRouteAliases().map((item)=>item.path);
  for (const route of ['/','/chat','/beallitasok','/system-center','/obd2','/smarthome','/tools/calendar','/tools/finance']) {
    assert.equal(routes.includes(route),true,route);
  }
  assert.equal(getApprovalMode('search_data'),'instant');
  assert.equal(getApprovalMode('call_contact'),'confirm');
  assert.equal(getApprovalMode('draft_email'),'confirm');
  assert.equal(getApprovalMode('control_device'),'confirm');
  assert.equal(getApprovalMode('trigger_scene'),'confirm');
  assert.equal(getApprovalMode('run_routine'),'confirm');
});

test('newly discovered tools default to owner-gated instead of silently executing', () => {
  syncDiscoveredTools(['future_unclassified_tool']);
  assert.equal(getApprovalMode('future_unclassified_tool'),'owner');
  assert.equal(listToolCapabilities().some((item)=>item.tool === 'future_unclassified_tool'),true);
  assert.match(assistantTools,/syncDiscoveredTools\(Object\.keys\(TOOLS\)\)/);
});

test('wake-word parser extracts commands and ignores speech without Jarvis', () => {
  assert.deepEqual(
    extractWakeWordCommand('Jarvis, nyisd meg a térképet.','jarvis'),
    { matched:true, command:'nyisd meg a térképet.', wakeWord:'jarvis' }
  );
  assert.equal(extractWakeWordCommand('Nyisd meg a térképet.','jarvis').matched,false);
  assert.equal(extractWakeWordCommand('Járvis menj a beállításokhoz','jarvis').matched,true);
});

test('voice runtime supports push-to-talk, hands-free and wake-word activation', () => {
  assert.match(voiceRuntime,/activationMode/);
  assert.match(voiceRuntime,/push-to-talk/);
  assert.match(voiceRuntime,/hands-free/);
  assert.match(voiceRuntime,/wake-word/);
  assert.match(voiceRuntime,/_prepareTranscript\(/);
  assert.match(voiceRuntime,/extractWakeWordCommand/);
  assert.match(settings,/Hangaktiválás/);
  assert.match(settings,/Ébresztőszó/);
  assert.match(globalVoice,/activationMode === 'push-to-talk'/);
  assert.match(voiceStage,/activationMode === 'wake-word'/);
});

test('complex commands route through Planner Executor Verifier before ordinary assistant turn', () => {
  assert.match(router,/shouldUseAgentPlanner/);
  assert.match(router,/runAgentTask/);
  assert.match(agent,/makePlan/);
  assert.match(agent,/executeActions/);
  assert.match(agent,/verifyStep/);
  assert.match(agent,/failureFeedback/);
  assert.match(agent,/round<=2/);
  assert.match(agent,/Maximum 6 steps/);
});

test('agent actions and plans are persisted as local operational memory', () => {
  assert.match(memory,/AgentEpisode/);
  assert.match(memory,/recordActionEpisode/);
  assert.match(memory,/recordAgentEpisode/);
  assert.match(memory,/findRelevantAgentEpisodes/);
  assert.match(assistantTools,/agentEpisodes/);
  assert.match(assistantTools,/recordActionEpisode/);
});

test('Crash Watchdog records failures, bounds restart loops and exposes manual Self-Repair analysis', () => {
  assert.match(electronMain,/registerCrashWatchdog/);
  assert.match(electronMain,/render-process-gone/);
  assert.match(electronMain,/renderer-load-failed/);
  assert.match(electronMain,/reloads\.length < 3/);
  assert.match(electronMain,/CRASH WATCHDOG HISTORY/);
  assert.match(preload,/getRecentCrashes/);
  assert.match(preload,/reportRendererIssue/);
  assert.match(rendererMain,/reportRendererIssue/);
  assert.match(system,/Crash Watchdog \+ helyreállítás/);
  assert.match(system,/Legutóbbi crash elemzése/);
});

test('Crash Watchdog history is removed by full local-data erasure', () => {
  assert.match(electronMain,/path\.join\(userData, 'crash-watchdog'\)/);
});

test('release publication keeps checksum and signer gates in CI', () => {
  assert.match(workflow,/Create SHA-256 checksum/);
  assert.match(workflow,/Create release candidate manifest/);
  assert.match(workflow,/Verify signer before publication/);
  assert.match(workflow,/release-manifest\.json/);
});

test('GitHub release publication remains explicit owner-controlled and signing-aware', () => {
  assert.match(workflow,/publish_release:/);
  assert.match(workflow,/allow_unsigned_release:/);
  assert.match(workflow,/WINDOWS_CSC_LINK/);
  assert.match(workflow,/WINDOWS_CSC_KEY_PASSWORD/);
  assert.match(workflow,/Create release candidate manifest/);
  assert.match(workflow,/Verify signer before publication/);
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/inputs\.publish_release == true/);
  assert.match(workflow,/release-manifest\.json/);
});
