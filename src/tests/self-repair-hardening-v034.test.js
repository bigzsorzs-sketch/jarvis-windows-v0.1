import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repair = require('../../electron/developer-repair.cjs');
const learningModule = require('../../electron/self-repair-learning.cjs');
const adminSource = fs.readFileSync('electron/admin-diagnostics.cjs','utf8');
const main = fs.readFileSync('electron/main.cjs','utf8');
const preload = fs.readFileSync('electron/preload.cjs','utf8');
const system = fs.readFileSync('src/pages/SystemCenter.jsx','utf8');
const layout = fs.readFileSync('src/components/Layout.jsx','utf8');
const fast = fs.readFileSync('src/lib/fastChatReplies.js','utf8');
const toolsSource = fs.readFileSync('src/lib/assistantTools.js','utf8');
const live = fs.readFileSync('src/pages/LiveAssistant.jsx','utf8');
const voice = fs.readFileSync('src/components/voice/VoiceCommandEngine.jsx','utf8');

function makeWorkspace() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-map-'));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'jarvis-desktop',version:'test'}));
  fs.mkdirSync(path.join(root,'src','pages'),{recursive:true});
  fs.mkdirSync(path.join(root,'src','components'),{recursive:true});
  fs.mkdirSync(path.join(root,'electron'),{recursive:true});
  fs.writeFileSync(path.join(root,'src','App.jsx'),[
    "import Chat from './pages/Chat';",
    "import Layout from './components/Layout';",
    "const SystemCenter = lazy(() => import('./pages/SystemCenter'));",
    "export default function App(){return <><Layout/><Route path=\"/chat\" element={<Chat/>}/><Route path=\"/system-center\" element={<SystemCenter/>}/></>}"
  ].join('\n'));
  fs.writeFileSync(path.join(root,'src','pages','Chat.jsx'),"import X from '../components/Used'; export default function Chat(){return X;}");
  fs.writeFileSync(path.join(root,'src','pages','Dormant.jsx'),"export default function Dormant(){return null;}");
  fs.writeFileSync(path.join(root,'src','pages','SystemCenter.jsx'),"export default function SystemCenter(){return null;}");
  fs.writeFileSync(path.join(root,'src','components','Layout.jsx'),"export default function Layout(){return null;}");
  fs.writeFileSync(path.join(root,'src','components','Used.jsx'),"export default 1;");
  fs.writeFileSync(path.join(root,'electron','main.cjs'),"const p=require('./preload.cjs'); ipcMain.handle('x:test',()=>p);");
  fs.writeFileSync(path.join(root,'electron','preload.cjs'),"ipcRenderer.invoke('x:test');");
  return root;
}

test('Self-Repair maps reachability, routes, dependencies and IPC', () => {
  const root=makeWorkspace();
  try {
    const inspected=repair.inspectWorkspace(root);
    assert.equal(inspected.architecture.routes.some(r=>r.route==='/chat' && r.file==='src/pages/Chat.jsx'),true);
    assert.equal(inspected.architecture.reachability['src/pages/Chat.jsx'],'renderer-active');
    assert.equal(inspected.architecture.reachability['src/pages/Dormant.jsx'],'inactive-or-unreferenced');
    assert.equal(inspected.architecture.routes.some(r=>r.route==='/system-center' && r.file==='src/pages/SystemCenter.jsx'),true);
    assert.equal(inspected.architecture.reachability['src/pages/SystemCenter.jsx'],'renderer-active');
    assert.equal(inspected.architecture.ipc.some(c=>c.channel==='x:test' && c.connected),true);
    const ctx=repair.buildDiagnosticContext(root,'Chat IPC route',{maxFiles:12,maxChars:20000});
    assert.equal(ctx.excerpts.some(e=>e.path==='src/pages/Chat.jsx'),true);
    assert.equal(ctx.excerpts.some(e=>e.path==='electron/main.cjs'),true);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('Self-Repair recognizes natural Hungarian repair execution requests', () => {
  const cases = [
    'végezd el a javítást',
    'készíts konkrét javítási tervet az electron/main.cjs fájlhoz',
    'javítsd ki ezt a hibát',
    'töröld ezt a régi modult',
    'add hozzá ezt a funkciót',
    'implementáld ezt a változtatást',
    'apply the fix'
  ];
  for (const value of cases) assert.equal(repair.isExplicitRepairRequest(value),true,value);
  for (const value of [
    'nézd meg miért nem tudod végre hajtani a javítást',
    'ellenőrizd a javítási folyamatot',
    'magyarázd el hogyan működik a javítás',
    'mi a javítás állapota?'
  ]) assert.equal(repair.isExplicitRepairRequest(value),false,value);
});

test('Self-Repair trust core and release metadata cannot be modified by AI repair plans', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-trust-core-'));
  try {
    fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'jarvis-desktop',version:'0.3.24'}));
    fs.mkdirSync(path.join(root,'electron'),{recursive:true});
    fs.mkdirSync(path.join(root,'src','lib'),{recursive:true});
    fs.mkdirSync(path.join(root,'release-notes'),{recursive:true});
    fs.writeFileSync(path.join(root,'electron','main.cjs'),'module.exports = {};\n');
    fs.writeFileSync(path.join(root,'src','lib','appVersion.js'),"export const APP_VERSION = '0.3.24';\n");
    fs.writeFileSync(path.join(root,'release-notes','v0.3.24.md'),'# Jarvis v0.3.24\n');

    for (const file of [
      'electron/main.cjs',
      'src/pages/SystemCenter.jsx',
      'src/lib/appVersion.js',
      'release-notes/v0.3.24.md',
      'eslint.config.js',
      'tsconfig.json',
      'vite.config.js',
      'src/tests/new-ai-written.test.js',
      '.github/anything.md'
    ]) {
      assert.throws(
        ()=>repair.validateOwnerPlan(root,{
          goal:'tamper test',
          patches:[{file,content:'changed'}]
        }),
        /DEV_REPAIR_OWNER_BLOCKED_PATH/,
        file
      );
    }
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('Self-Repair canonicalizes approved text bytes before local validation and activation', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-canonical-repair-'));
  try {
    fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'jarvis-desktop',version:'0.3.23'}));
    const file=path.join(root,'src','pages','sample.js');
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,'export const a = 1;\r\nexport const b = 2;\r\n','utf8');
    const plan=repair.validateOwnerPlan(root,{
      goal:'canonical bytes',
      risk:'low',
      patches:[{file:'src/pages/sample.js',replacements:[{search:'a = 1',replace:'a = 3'}]}]
    });
    repair.applyOwner(root,plan);
    assert.match(fs.readFileSync(file,'utf8'),/\r\n/);
    repair.normalizeOwnerPlanFiles(root,plan);
    const canonical=fs.readFileSync(file,'utf8');
    assert.equal(canonical.includes('\r'),false);
    assert.equal(canonical,'export const a = 3;\nexport const b = 2;\n');
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('Self-Repair learning stores only verified local lessons', () => {
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-learning-')),'learning.json');
  const learning=new learningModule.SelfRepairLearning(file);
  learning.recordVerified({title:'Voice repair',files:['src/a.js'],evidence:'test passed',validation:'node --test: OK',success:true});
  assert.equal(learning.stats().entries,1);
  assert.equal(learning.relevant('voice',5)[0].title,'Voice repair');
});

test('reported v0.3.4 regressions are fixed in source', () => {
  assert.match(layout,/currentItem = allDesktopItems\.find\(\(item\) => item\.path === location\.pathname\)/);
  assert.match(layout,/\['\/muszerfal','\/memoria','\/automotive','\/obd2','\/system-center'\]\.includes\(p\)/);
  assert.doesNotMatch(fast,/if \(\/\(hallasz\|hallod/);
  assert.match(fast,/\^\(\?:hallasz\|hallod/);
  assert.match(toolsSource,/requireStrictNumber/);
  assert.match(toolsSource,/safeStringify/);
  assert.match(toolsSource,/createInvoiceNumber/);
  assert.doesNotMatch(toolsSource,/const inv_number = 'INV-' \+ Math\.random/);
  assert.match(system,/safeJsonForPrompt/);
  assert.match(system,/canonicalAppVersion/);
  assert.doesNotMatch(system,/PrivacyTerms\.jsx/);
  assert.doesNotMatch(toolsSource,/quantity: parseFloat\(i\.quantity\) \|\| 1/);
  assert.match(toolsSource,/\.search\(q, getUserFilter\(currentUser\), 1000\)/);
  assert.match(main,/DELETE_VERIFICATION_FAILED/);
  assert.match(main,/developerBackupRoot\(\)/);
  assert.match(main,/SELF_REPAIR_FINGERPRINT_ENTRIES/);
  assert.match(main,/sourceState\.sourceFingerprint !== installedSourceFingerprint/);
  assert.match(main,/workspaceDirty = selfRepairSourceFingerprint\(target\) !== installedSourceFingerprint/);
  assert.match(main,/function writeJsonAtomic/);
  assert.doesNotMatch(main,/GITHUB_REPAIR_STATE_PERSIST_FAILED|createRepairPullRequest|jarvis:self-repair:github/);
  assert.match(main,/const workspace = entry\?\.workspace/);
  assert.match(main,/MANUAL_REPAIR_WORKSPACE_REQUIRED/);
  assert.match(main,/sourceFingerprint:readJson\(manualWorkspaceSourceStatePath\(workspace\), \{\}\)\.sourceFingerprint/);
  assert.match(main,/workspaceSourceFingerprint:selfRepairSourceFingerprint\(entry\.workspace\)/);
  assert.match(main,/isManualRepairRuntime/);
  assert.match(main,/--jarvis-manual-runtime/);
  assert.match(main,/scheduleManualRuntimeRestart/);
  assert.match(main,/handOffToManualRuntimeIfReady/);
  assert.match(main,/status:'APPLIED_AND_RESTARTING'/);
  assert.doesNotMatch(main,/function clearLegacyManualRuntimeState/);
  assert.match(main,/canonicalAppVersion\(item\?\.appVersion\)/);
  assert.match(main,/JARVIS_REPAIR_REPORT_STALE/);
  assert.match(preload,/apply: \(repairId, reportId\)/);
  assert.match(system,/setRepairPlan\(null\)/);
  assert.match(system,/repair\.id, repairPlan\?\.reportId/);
  assert.doesNotMatch(live,/slice\(0, 420\)/);
  assert.match(live,/persistChainRef/);
  assert.match(live,/lastTranscriptEvent/);
  assert.match(voice,/lastTranscriptEvent/);
  assert.match(voice,/voice\.speakText\(msg, 'hu'\)/);
});

test('elevated diagnostics is UAC-gated and does not expose arbitrary command execution to renderer', () => {
  assert.match(adminSource,/Start-Process[\s\S]*-Verb RunAs/);
  assert.match(adminSource,/SESSION_TTL_MS = 30 \* 60 \* 1000/);
  assert.match(preload,/elevatedDiagnostics/);
  assert.match(preload,/jarvis:admin:start/);
  assert.match(preload,/jarvis:admin:snapshot/);
  assert.doesNotMatch(preload,/jarvis:admin:request/);
  assert.match(system,/Rendszergazdai hozzáférés engedélyezése/);
  assert.match(main,/UAC-AUTHORIZED WINDOWS DIAGNOSTICS/);
});
