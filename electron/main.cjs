'use strict';

const { app, BrowserWindow, ipcMain, dialog, safeStorage, session, nativeTheme, shell } = require('electron');
const path = require('path');
const activation = require('./runtime-activation.cjs');
const { fileURLToPath } = require('url');
const fs = require('fs');
const os = require('os');
const { execFile, execFileSync, spawn } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const execFileAsync = promisify(execFile);
const { PolicyEngine } = require('./security/policy-engine.cjs');
const { NativeObdBridge } = require('./obd/native-obd-bridge.cjs');
const { LocalDatabase } = require('./data/local-database.cjs');
const { BackupManager } = require('./data/backup-manager.cjs');
const developerRepair = require('./developer-repair.cjs');
const githubSelfRepair = require('./github-self-repair.cjs');
const { validateUploadedFileUrl } = require('./analysis/file-upload-validator.cjs');
const { SelfRepairLearning } = require('./self-repair-learning.cjs');
const { parseHelperArgs, startAdminHelper, AdminDiagnosticsManager } = require('./admin-diagnostics.cjs');
const {
  analyzeUploadedFiles,
  analyzeProjectDeep,
  analyzeProjectSpecialists,
} = require('./analysis/file-analyzer.cjs');

const isManualRepairRuntime = process.argv.includes('--jarvis-manual-runtime');
const isDev = !app.isPackaged && !isManualRepairRuntime;
let mainWindow;
let policy;
let obdBridge;
let database;
let backupManager;
let selfRepairLearning;
let adminDiagnosticsManager;
const adminHelperConfig = parseHelperArgs(process.argv);
if (adminHelperConfig) {
  // The elevated helper is a second Electron process. Give it a separate
  // profile so it cannot collide with locks held by the already-running Jarvis.
  const helperUserData = path.join(os.tmpdir(),'JarvisAdminHelper',adminHelperConfig.pipeName);
  fs.mkdirSync(helperUserData,{recursive:true});
  app.setPath('userData',helperUserData);
}
const manualRepairPlans = new Map();
let manualRepairApplyInFlight = false;
let latestSystemReport = null;

const DEFAULT_STT_MODEL = 'openai/whisper-large-v3-turbo';
const DEFAULT_TTS_MODEL = 'google/gemini-3.8-flash-tts';
const FALLBACK_TTS_MODEL = 'google/gemini-3.8-flash-lite-tts';
const DEFAULT_TTS_VOICE = 'Charon';
const GOOGLE_TTS_VOICES = new Set([
  'Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede','Callirrhoe','Autonoe',
  'Enceladus','Iapetus','Umbriel','Algieba','Despina','Erinome','Algenib','Rasalgethi',
  'Laomedeia','Achernar','Alnilam','Schedar','Gacrux','Pulcherrima','Achird',
  'Zubenelgenubi','Vindemiatrix','Sadachbia','Sadaltager','Sulafat'
]);

function resourcePath(...parts) {
  return app.isPackaged ? path.join(app.getAppPath(), ...parts) : path.join(__dirname, '..', ...parts);
}

function selfRepairSourceRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'self-development-source')
    : path.join(__dirname, '..');
}

let activeSelfRepairToolchainRoot = null;
function selfRepairToolchainPaths() {
  let root = String(process.env.JARVIS_SELF_REPAIR_TOOLCHAIN || '').trim();
  if (!root && app.isPackaged) root = path.join(process.resourcesPath, 'self-repair-toolchain');
  if (!root) {
    try { root = String(readJson(manualRuntimeStatePath(),{}).toolchainRoot || '').trim(); } catch {}
  }
  if (!root) root = activeSelfRepairToolchainRoot;
  if (!root) return null;
  const node = path.join(root, process.platform === 'win32' ? 'node.exe' : 'node');
  const npmCli = path.join(root, 'npm', 'bin', 'npm-cli.js');
  if (!fs.existsSync(node) || !fs.existsSync(npmCli)) {
    throw new Error('SELF_REPAIR_TOOLCHAIN_MISSING');
  }
  activeSelfRepairToolchainRoot = root;
  return { root, node, npmCli };
}

function withSelfRepairToolchainEnv(options={}, toolchain=selfRepairToolchainPaths()) {
  if (!toolchain) return options;
  const env = { ...process.env, ...(options.env || {}) };
  const existingPath = env.PATH || env.Path || '';
  const toolchainPath = [toolchain.root, existingPath].filter(Boolean).join(path.delimiter);
  return {
    ...options,
    env:{ ...env, PATH:toolchainPath, Path:toolchainPath }
  };
}

async function runToolchainNode(args, options={}) {
  const toolchain = selfRepairToolchainPaths();
  if (!toolchain) {
    return execFileAsync(process.platform === 'win32' ? 'node.exe' : 'node', args, options);
  }
  return execFileAsync(toolchain.node, args, withSelfRepairToolchainEnv(options, toolchain));
}

async function runToolchainNpm(args, options={}) {
  const toolchain = selfRepairToolchainPaths();
  if (!toolchain) {
    return execFileAsync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, options);
  }
  return execFileAsync(toolchain.node, [toolchain.npmCli, ...args], withSelfRepairToolchainEnv(options, toolchain));
}

function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function developerBackupRoot() { return path.join(app.getPath('userData'),'developer-repair-backups'); }
function manualRepairRoot() { return path.join(app.getPath('userData'),'manual-self-repair'); }
function manualRuntimeStatePath() { return path.join(manualRepairRoot(),'runtime.json'); }
function manualRepairPlanStoreRoot() { return path.join(manualRepairRoot(),'plans'); }
function githubRepairStatePath() { return path.join(manualRepairRoot(),'github-repair-state.json'); }
function readGitHubRepairState() { return readJson(githubRepairStatePath(),null); }
function writeGitHubRepairState(value) {
  if (!value) { try { fs.rmSync(githubRepairStatePath(),{force:true}); } catch {} return null; }
  writeJsonAtomic(githubRepairStatePath(),value);
  return value;
}
function manualRepairPlanFile(hash) {
  const safeHash = String(hash || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(safeHash)) return null;
  return path.join(manualRepairPlanStoreRoot(), safeHash + '.json');
}
function removePersistedManualRepairPlan(hash) {
  const file = manualRepairPlanFile(hash);
  if (!file) return;
  try { fs.rmSync(file,{force:true}); } catch {}
}
function persistManualRepairPlan(entry) {
  const hash = String(entry?.plan?.hash || '').trim().toLowerCase();
  const file = manualRepairPlanFile(hash);
  if (!file) throw new Error('MANUAL_REPAIR_INVALID_PLAN_HASH');
  const workspace = entry?.workspace;
  if (!workspace) throw new Error('MANUAL_REPAIR_WORKSPACE_REQUIRED');
  writeJson(file,{
    version:String(app.getVersion?.() || ''),
    sourceFingerprint:readJson(manualWorkspaceSourceStatePath(workspace), {}).sourceFingerprint
      || selfRepairSourceFingerprint(selfRepairSourceRoot()),
    createdAt:Number(entry?.createdAt) || Date.now(),
    workspaceSourceFingerprint:selfRepairSourceFingerprint(entry.workspace),
    plan:entry.plan
  });
}
function loadPersistedManualRepairPlan(hash) {
  const file = manualRepairPlanFile(hash);
  if (!file || !fs.existsSync(file)) return null;
  const saved = readJson(file,null);
  if (!saved?.plan) {
    removePersistedManualRepairPlan(hash);
    return null;
  }

  const currentVersion = String(app.getVersion?.() || '');
  const currentFingerprint = selfRepairSourceFingerprint(selfRepairSourceRoot());
  if (String(saved.version || '') !== currentVersion || String(saved.sourceFingerprint || '') !== currentFingerprint) {
    removePersistedManualRepairPlan(hash);
    return null;
  }

  if (
    !saved.workspaceSourceFingerprint
    || saved.workspaceSourceFingerprint !== selfRepairSourceFingerprint(manualRepairWorkspaceRoot())
    || Date.now() - Number(saved.createdAt || 0) > 60 * 60 * 1000
  ) {
    removePersistedManualRepairPlan(hash);
    return null;
  }

  const approvedPlan = { ...saved.plan };
  delete approvedPlan.hash;
  if (developerRepair.proposalHash(approvedPlan) !== String(hash || '').toLowerCase()) {
    removePersistedManualRepairPlan(hash);
    return null;
  }

  try {
    const workspace = manualRepairWorkspaceRoot();
    const plan = developerRepair.validateOwnerPlan(workspace,approvedPlan);
    if (plan.hash !== String(hash || '').toLowerCase()) {
      removePersistedManualRepairPlan(hash);
      return null;
    }
    return { workspace, plan, createdAt:Number(saved.createdAt) || 0 };
  } catch {
    removePersistedManualRepairPlan(hash);
    return null;
  }
}
function clearPendingManualRepairPlans() {
  manualRepairPlans.clear();
  const root = manualRepairPlanStoreRoot();
  if (!fs.existsSync(root)) return;
  for (const name of fs.readdirSync(root)) {
    if (/^[a-f0-9]{64}\.json$/.test(name)) {
      try { fs.rmSync(path.join(root,name),{force:true}); } catch {}
    }
  }
}

function mostRecentPendingManualRepair() {
  const root = manualRepairPlanStoreRoot();
  if (!fs.existsSync(root)) return null;
  let newest = null;
  for (const name of fs.readdirSync(root)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const hash = name.slice(0,-5);
    const entry = loadPersistedManualRepairPlan(hash);
    if (entry && (!newest || entry.createdAt > newest.createdAt)) newest = entry;
  }
  if (!newest) return null;
  return {
    hash:newest.plan.hash,
    goal:newest.plan.goal,
    rationale:newest.plan.rationale,
    risk:newest.plan.risk,
    files:newest.plan.patches.map((patch)=>patch.file)
  };
}

function manualRepairWorkspaceRoot() {
  const safeVersion = String(app.getVersion?.() || 'current')
    .replace(/^v/i,'')
    .replace(/[^0-9A-Za-z._-]/g,'_');
  return path.join(manualRepairRoot(),`v${safeVersion}`);
}

const SELF_REPAIR_FINGERPRINT_ENTRIES = [
  'src','electron','security','scripts','.github','release-notes',
  'package.json','package-lock.json','index.html','eslint.config.js',
  'postcss.config.js','tailwind.config.js','vite.config.js','tsconfig.json',
  'jsconfig.json','components.json','THIRD_PARTY_NOTICES.md'
];

function manualWorkspaceSourceStatePath(workspace = manualRepairWorkspaceRoot()) {
  return path.join(workspace,'.jarvis-source.json');
}

function selfRepairSourceFingerprint(root = selfRepairSourceRoot()) {
  const digest = crypto.createHash('sha256');
  const visit = (full, relative) => {
    if (!fs.existsSync(full)) return;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(full).sort()) {
        visit(path.join(full,name), path.posix.join(relative,name));
      }
      return;
    }
    if (!stat.isFile()) return;
    digest.update(relative.replace(/\\/g,'/'));
    digest.update('\0');
    digest.update(fs.readFileSync(full));
    digest.update('\0');
  };
  for (const entry of SELF_REPAIR_FINGERPRINT_ENTRIES) {
    visit(path.join(root,entry), entry);
  }
  return digest.digest('hex');
}
async function ensureManualRepairWorkspace() {
  const target = manualRepairWorkspaceRoot();
  const sourceRoot = selfRepairSourceRoot();
  const entries = [
    'src','electron','security','build','scripts','.github','release-notes',
    'package.json','package-lock.json','index.html','eslint.config.js',
    'postcss.config.js','tailwind.config.js','vite.config.js','tsconfig.json',
    'jsconfig.json','components.json','THIRD_PARTY_NOTICES.md'
  ];

  fs.mkdirSync(target,{recursive:true});
  if (isManualRepairRuntime) return developerRepair.validateWorkspace(target);

  const installedVersion = String(app.getVersion?.() || '');
  const installedSourceFingerprint = selfRepairSourceFingerprint(sourceRoot);
  const sourceState = readJson(manualWorkspaceSourceStatePath(target),{});
  let currentVersion = '';
  try {
    currentVersion = String(JSON.parse(fs.readFileSync(path.join(target,'package.json'),'utf8'))?.version || '');
  } catch {}

  const requiredWorkspaceFiles = [
    'src/pages/SystemCenter.jsx',
    'electron/main.cjs',
    'electron/developer-repair.cjs',
    'package.json'
  ];
  const incompleteWorkspace = requiredWorkspaceFiles.some((file) => !fs.existsSync(path.join(target,file)));
  const sourceChanged = !sourceState.sourceFingerprint || sourceState.sourceFingerprint !== installedSourceFingerprint;
  let workspaceDirty = false;
  if (!incompleteWorkspace && currentVersion) {
    try {
      workspaceDirty = selfRepairSourceFingerprint(target) !== installedSourceFingerprint;
    } catch {
      workspaceDirty = true;
    }
  }
  const mustRefresh = incompleteWorkspace
    || !currentVersion
    || (installedVersion && currentVersion !== installedVersion)
    || sourceChanged
    || workspaceDirty;
  if (mustRefresh) {
    for (const entry of entries) {
      const destination = path.join(target,entry);
      if (fs.existsSync(destination)) {
        fs.rmSync(destination,{recursive:true,force:true,maxRetries:6,retryDelay:120});
      }
      const externalSource = path.join(sourceRoot,entry);
      const source = fs.existsSync(externalSource) ? externalSource : resourcePath(entry);
      if (!fs.existsSync(source)) continue;
      const stat = fs.statSync(source);
      fs.mkdirSync(path.dirname(destination),{recursive:true});
      if (stat.isDirectory()) fs.cpSync(source,destination,{recursive:true});
      else fs.copyFileSync(source,destination);
    }
    writeJson(manualWorkspaceSourceStatePath(target),{
      version:installedVersion,
      sourceFingerprint:installedSourceFingerprint,
      refreshedAt:new Date().toISOString()
    });
  }

  const workspace = developerRepair.validateWorkspace(target);
  const packagePath = path.join(workspace,'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath,'utf8'));
  if (installedVersion && String(pkg.version || '') !== installedVersion) {
    throw new Error('MANUAL_REPAIR_PACKAGE_VERSION_MISMATCH');
  }
  return workspace;
}

function manualRuntimeElectronPath(workspace) {
  return path.join(
    workspace,
    'node_modules',
    'electron',
    'dist',
    process.platform === 'win32' ? 'electron.exe' : 'electron'
  );
}

function installedExecutable() {
  if (app.isPackaged) return process.execPath;
  const argument = process.argv.find(value => value.startsWith('--jarvis-installed-exe='));
  const candidate = argument ? argument.slice('--jarvis-installed-exe='.length) : readManualRuntimeState().installedExecPath;
  if (!candidate || !path.isAbsolute(candidate) || !fs.existsSync(candidate)
    || path.basename(candidate).toLowerCase() !== 'jarvis.exe') {
    throw new Error('UPDATE_INSTALLED_EXECUTABLE_UNKNOWN');
  }
  return candidate;
}

function readManualRuntimeState() {
  return readJson(manualRuntimeStatePath(), {});
}

async function ensureManualRuntimeBuilt(workspace) {
  const electronPath = manualRuntimeElectronPath(workspace);
  const modulesPath = path.join(workspace,'node_modules');

  if (!fs.existsSync(electronPath)) {
    await runToolchainNpm(['ci','--no-audit','--no-fund'],{
      cwd:workspace,
      windowsHide:true,
      timeout:900000,
      shell:false,
      maxBuffer:16 * 1024 * 1024
    });
  }

  if (!fs.existsSync(modulesPath) || !fs.existsSync(electronPath)) {
    throw new Error('MANUAL_REPAIR_RUNTIME_DEPENDENCIES_MISSING');
  }

  const checks=[];
  const checkNpm = async (command, timeout=300000) => {
    await runToolchainNpm(['run',command],{
      cwd:workspace,
      windowsHide:true,
      timeout,
      shell:false,
      maxBuffer:16 * 1024 * 1024
    });
    checks.push({cmd:'npm run ' + command,ok:true});
  };
  await runToolchainNode(['scripts/audit-all-source.cjs'], {
    cwd:workspace,
    windowsHide:true,
    timeout:300000,
    shell:false,
    maxBuffer:16 * 1024 * 1024
  });
  checks.push({cmd:'node scripts/audit-all-source.cjs',ok:true});
  await checkNpm('lint');
  await checkNpm('typecheck');
  await checkNpm('verify:jarvis');
  const testDir = path.join(workspace,'src','tests');
  const testFiles = fs.readdirSync(testDir)
    .filter((name)=>name.endsWith('.test.js'))
    .sort()
    .map((name)=>path.join('src','tests',name));
  if (!testFiles.length) throw new Error('MANUAL_REPAIR_TESTS_MISSING');
  await runToolchainNode(['--test',...testFiles],{
    cwd:workspace,
    windowsHide:true,
    timeout:300000,
    shell:false,
    maxBuffer:16 * 1024 * 1024
  });
  checks.push({cmd:'node --test src/tests/*.test.js',ok:true});
  await checkNpm('build');

  const renderer = path.join(workspace,'dist','index.html');
  if (!fs.existsSync(renderer)) throw new Error('MANUAL_REPAIR_RUNTIME_BUILD_MISSING');

  const toolchain = selfRepairToolchainPaths();
  const state = {
    enabled:true,
    installedExecPath:installedExecutable(),
    version:String(app.getVersion?.() || ''),
    sourceFingerprint:readJson(manualWorkspaceSourceStatePath(workspace), {}).sourceFingerprint
      || selfRepairSourceFingerprint(selfRepairSourceRoot()),
    workspace,
    electronPath,
    toolchainRoot:toolchain?.root || null,
    builtAt:new Date().toISOString()
  };
  writeJson(manualRuntimeStatePath(),state);
  return {...state,checks};
}

function scheduleManualRuntimeRestart(workspace) {
  const state = readManualRuntimeState();
  const electronPath = state.electronPath || manualRuntimeElectronPath(workspace);
  setTimeout(() => {
    try {
      app.relaunch({
        execPath:electronPath,
        args:[workspace,'--jarvis-manual-runtime','--jarvis-installed-exe=' + installedExecutable()]
      });
      app.exit(0);
    } catch (error) {
      // Never keep a failed runtime active for the next Jarvis launch.
      try { fs.rmSync(manualRuntimeStatePath(),{force:true}); } catch {}
      recordCrash('manual-self-repair-restart-failed',{
        message:String(error?.message || error),
        workspace
      });
    }
  },900);
}

function handOffToManualRuntimeIfReady() {
  if (!app.isPackaged || isManualRepairRuntime || process.argv.includes('--jarvis-safe-start')) return false;
  const state = readManualRuntimeState();
  if (state.enabled !== true) return false;

  const expectedWorkspace = path.resolve(manualRepairWorkspaceRoot());
  const workspace = path.resolve(String(state.workspace || ''));
  const version = String(app.getVersion?.() || '');
  const sourceFingerprint = selfRepairSourceFingerprint(selfRepairSourceRoot());
  if (
    workspace !== expectedWorkspace
    || String(state.version || '') !== version
    || !state.sourceFingerprint
    || state.sourceFingerprint !== sourceFingerprint
  ) {
    try { fs.rmSync(manualRuntimeStatePath(),{force:true}); } catch {}
    return false;
  }

  const electronPath = manualRuntimeElectronPath(workspace);
  const renderer = path.join(workspace,'dist','index.html');
  if (!fs.existsSync(electronPath) || !fs.existsSync(renderer)) {
    try { fs.rmSync(manualRuntimeStatePath(),{force:true}); } catch {}
    return false;
  }

  try {
    app.relaunch({
      execPath:electronPath,
      args:[workspace,'--jarvis-manual-runtime','--jarvis-installed-exe=' + installedExecutable()]
    });
    app.exit(0);
    return true;
  } catch (error) {
    // Fall back to the installed, known-startable package if the handoff fails.
    try { fs.rmSync(manualRuntimeStatePath(),{force:true}); } catch {}
    recordCrash('manual-runtime-handoff-failed',{
      message:String(error?.message || error),
      workspace
    });
    return false;
  }
}

function crashLogPath() { return path.join(app.getPath('userData'),'crash-watchdog','crashes.jsonl'); }
function crashRecoveryStatePath() { return path.join(app.getPath('userData'),'crash-watchdog','recovery.json'); }
function canonicalAppVersion(value='') {
  return String(value || '').trim().replace(/^v/i,'').split('+')[0];
}

function appendJsonLine(file, value) {
  try {
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.appendFileSync(file,JSON.stringify(value)+'\n','utf8');
  } catch {}
}

function readRecentCrashes(limit=20) {
  try {
    const lines=fs.readFileSync(crashLogPath(),'utf8').split(/\r?\n/).filter(Boolean);
    return lines.slice(-Math.max(1,Math.min(100,Number(limit)||20))).reverse().map((line)=>{
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function recordCrash(kind, details={}) {
  const entry={
    id:crypto.randomUUID(),
    at:new Date().toISOString(),
    kind:String(kind || 'unknown'),
    appVersion:app.getVersion?.() || 'unknown',
    platform:process.platform,
    details
  };
  appendJsonLine(crashLogPath(),entry);
  return entry;
}

function registerCrashWatchdog(win) {
  if (!win?.webContents) return;
  win.webContents.on('render-process-gone', (_event, details={}) => {
    const crash=recordCrash('renderer-process-gone',{
      reason:details.reason || 'unknown',
      exitCode:details.exitCode ?? null
    });
    const recent=readRecentCrashes(10).filter((item)=>
      item.kind === 'renderer-process-gone' && Date.now()-Date.parse(item.at) < 10*60*1000
    );
    const state=readJson(crashRecoveryStatePath(),{reloads:[]});
    const reloads=(state.reloads || []).filter((at)=>Date.now()-Number(at)<10*60*1000);
    if (recent.length <= 3 && reloads.length < 3) {
      reloads.push(Date.now());
      writeJson(crashRecoveryStatePath(),{reloads,lastCrashId:crash.id});
      setTimeout(()=>{ try { if (!win.isDestroyed()) win.reload(); } catch {} },1200);
      return;
    }

    dialog.showMessageBox({
      type:'error',
      title:'Jarvis Crash Watchdog',
      message:'Jarvis többször összeomlott rövid időn belül.',
      detail:'Az automatikus újraindítást leállítottam, hogy ne alakuljon ki crash-loop. A hibanapló megmaradt a Self-Repair számára.',
      buttons:['Rendben']
    }).catch(()=>{});
  });

  win.webContents.on('did-fail-load', (_event,errorCode,errorDescription,validatedURL,isMainFrame)=>{
    if (!isMainFrame) return;
    recordCrash('renderer-load-failed',{errorCode,errorDescription,validatedURL});
  });
}

async function validateDirectOwnerRepair(workspace, plan) {
  const results=[];
  for (const patch of plan?.patches || []) {
    const file = String(patch.file || '');
    const full = path.join(workspace,file);
    try {
      if (/\.(?:js|cjs|mjs)$/i.test(file)) {
        await runToolchainNode(['--check',file],{
          cwd:workspace,
          windowsHide:true,
          timeout:120000,
          shell:false
        });
        results.push({cmd:'node --check ' + file,ok:true,output:''});
      } else if (/\.json$/i.test(file)) {
        JSON.parse(fs.readFileSync(full,'utf8'));
        results.push({cmd:'json parse ' + file,ok:true,output:''});
      } else {
        results.push({cmd:'direct write ' + file,ok:true,output:'Owner-approved direct patch; no dependency install was run.'});
      }
    } catch (error) {
      results.push({cmd:'validate ' + file,ok:false,output:String(error?.stdout || error?.stderr || error?.message || error).slice(-3000)});
      return {ok:false,results};
    }
  }
  return {ok:true,results};
}

function localOwnerAuthorised() {
  try {
    const user = database?.getUser?.();
    return Boolean(user?.id === 'local-owner' && user?.role === 'owner');
  } catch {
    return false;
  }
}

async function requireOwnerPresence({title='Jarvis tulajdonosi jóváhagyás',message,detail=''}={}) {
  if (!localOwnerAuthorised()) throw new Error('JARVIS_OWNER_REQUIRED');
  const options = {
    type:'warning',
    buttons:['Mégse','Engedélyezem'],
    defaultId:0,
    cancelId:0,
    noLink:true,
    title,
    message:String(message || 'Ez a művelet külön tulajdonosi jóváhagyást igényel.'),
    detail:String(detail || 'A jóváhagyás csak erre az egy műveletre érvényes.')
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);
  if (result.response !== 1) throw new Error('JARVIS_OWNER_ACTION_CANCELLED');
  return true;
}

const INSTALLER_LANG_MAP = {
  '1033':'en','1038':'hu','1031':'de','1036':'fr','3082':'es','1034':'es','1040':'it',
  '2070':'pt','1046':'pt','1045':'pl','1048':'ro','1043':'nl','1049':'ru','2052':'zh'
};

function readInstallerLanguage() {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync('reg.exe',['query','HKLM\\Software\\Jarvis','/v','InstallerLanguage'],{encoding:'utf8',windowsHide:true,timeout:3000});
    const m = out.match(/InstallerLanguage\s+REG_SZ\s+([^\s]+)/i);
    return m ? (INSTALLER_LANG_MAP[String(m[1]).trim()] || null) : null;
  } catch { return null; }
}

function seedInitialSettings() {
  const file = settingsPath();
  if (fs.existsSync(file)) return;
  const language = readInstallerLanguage() || ({hu:'hu'}[app.getLocale()] || String(app.getLocale() || 'en').split('-')[0] || 'en');
  writeJson(file, { language, aiProvider:'openrouter', aiModel:'openrouter/auto' });
}
function readJson(file, fallback={}) { try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return fallback; } }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, JSON.stringify(value,null,2),'utf8'); }
function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const temp=file+'.tmp-'+process.pid+'-'+Date.now();
  try {
    fs.writeFileSync(temp,JSON.stringify(value,null,2),'utf8');
    fs.renameSync(temp,file);
  } finally {
    try { if (fs.existsSync(temp)) fs.rmSync(temp,{force:true}); } catch {}
  }
}

function protectSecret(value) {
  if (!value) return null;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('WINDOWS_SECURE_STORAGE_UNAVAILABLE');
  }
  return { type:'safeStorage', value:safeStorage.encryptString(value).toString('base64') };
}
function unprotectSecret(entry) {
  if (!entry?.value || entry.type !== 'safeStorage' || !safeStorage.isEncryptionAvailable()) return '';
  try {
    return safeStorage.decryptString(Buffer.from(entry.value,'base64'));
  } catch { return ''; }
}

function purgeInsecureLegacySecrets() {
  const file = settingsPath();
  const raw = readJson(file, {});
  let changed = false;
  if (raw.openRouterKey && raw.openRouterKey.type !== 'safeStorage') {
    delete raw.openRouterKey;
    changed = true;
  }
  if (raw.githubSelfRepairToken && raw.githubSelfRepairToken.type !== 'safeStorage') {
    delete raw.githubSelfRepairToken;
    changed = true;
  }
  if (changed) writeJson(file, raw);
  return changed;
}

function getSettingsInternal() {
  const raw = readJson(settingsPath(), {});
  const hasSecureOpenRouterKey = raw.openRouterKey?.type === 'safeStorage'
    && safeStorage.isEncryptionAvailable()
    && Boolean(raw.openRouterKey?.value);
  return {
    language: raw.language || 'hu',
    aiProvider: raw.aiProvider || 'openrouter',
    aiModel: raw.aiModel || 'openrouter/auto',
    aiRoutingMode: raw.aiRoutingMode || 'smart',
    aiCostTier: raw.aiCostTier || 'low',
    sttModel: raw.sttModel || DEFAULT_STT_MODEL,
    ttsModel: raw.ttsModel || DEFAULT_TTS_MODEL,
    ttsGender: raw.ttsGender || ((raw.ttsVoice || DEFAULT_TTS_VOICE) === 'Kore' ? 'female' : 'male'),
    ttsVoice: raw.ttsVoice || DEFAULT_TTS_VOICE,
    hasOpenRouterKey: hasSecureOpenRouterKey,
    hasGitHubSelfRepairToken: raw.githubSelfRepairToken?.type === 'safeStorage'
      && safeStorage.isEncryptionAvailable()
      && Boolean(raw.githubSelfRepairToken?.value),
  };
}

async function saveSettingsInternal(patch={}) {
  const raw = readJson(settingsPath(), {});
  if (typeof patch.language === 'string') raw.language = patch.language;
  if (typeof patch.aiProvider === 'string') raw.aiProvider = patch.aiProvider;
  if (typeof patch.aiModel === 'string') raw.aiModel = patch.aiModel;
  if (['smart','manual'].includes(patch.aiRoutingMode)) raw.aiRoutingMode = patch.aiRoutingMode;
  if (['low','medium','high','xhigh','max'].includes(patch.aiCostTier)) raw.aiCostTier = patch.aiCostTier;
  if (typeof patch.sttModel === 'string' && patch.sttModel.trim()) raw.sttModel = patch.sttModel.trim();
  if (typeof patch.ttsModel === 'string' && patch.ttsModel.trim()) raw.ttsModel = patch.ttsModel.trim();
  if (['male','female'].includes(patch.ttsGender)) {
    raw.ttsGender = patch.ttsGender;
    if (!patch.ttsVoice && !raw.ttsVoice) raw.ttsVoice = patch.ttsGender === 'female' ? 'Kore' : 'Charon';
  }
  if (typeof patch.ttsVoice === 'string' && patch.ttsVoice.trim()) raw.ttsVoice = patch.ttsVoice.trim();
  if (typeof patch.openRouterApiKey === 'string' && patch.openRouterApiKey.trim()) raw.openRouterKey = protectSecret(patch.openRouterApiKey.trim());
  if (patch.clearOpenRouterApiKey === true) delete raw.openRouterKey;
  writeJson(settingsPath(), raw);
  return getSettingsInternal();
}

async function connectGitHubSelfRepair(tokenValue) {
  const token = String(tokenValue || '').trim();
  const client = githubSelfRepair.createGitHubSelfRepairClient({ token, repo:githubSelfRepair.DEFAULT_REPO });
  const connection = await client.validateConnection();
  const raw = readJson(settingsPath(), {});
  raw.githubSelfRepairToken = protectSecret(token);
  writeJsonAtomic(settingsPath(), raw);
  return connection;
}

function disconnectGitHubSelfRepair() {
  const raw = readJson(settingsPath(), {});
  delete raw.githubSelfRepairToken;
  writeJsonAtomic(settingsPath(), raw);
  return { connected:false, repo:githubSelfRepair.DEFAULT_REPO };
}

function getGitHubSelfRepairClient() {
  const raw = readJson(settingsPath(), {});
  const token = unprotectSecret(raw.githubSelfRepairToken);
  if (!token) throw new Error('GITHUB_TOKEN_MISSING');
  return githubSelfRepair.createGitHubSelfRepairClient({ token, repo:githubSelfRepair.DEFAULT_REPO });
}

async function syncGitHubRepairState() {
  const stored = readGitHubRepairState();
  if (!stored) return null;
  const client = getGitHubSelfRepairClient();
  const next = { ...stored };

  if (next.prNumber && !next.mergeSha) {
    const pr = await client.getPullRequestStatus(next.prNumber);
    next.prStatus = pr;
    if (pr.merged && pr.mergeCommitSha) {
      next.mergeSha = pr.mergeCommitSha;
      next.phase = 'merged';
    }
  }

  if (next.mergeSha) {
    next.mainStatus = await client.getMainStatus(next.mergeSha);
    if (next.mainStatus?.state === 'current' && next.mainStatus?.ci?.state === 'passed' && next.phase === 'merged') {
      next.phase = 'main-verified';
    }
  }

  if (next.version && next.mergeSha && (next.releaseDispatchedAt || next.phase === 'released')) {
    const release = await client.getReleaseStatus({
      version:next.version,
      mergeSha:next.mergeSha,
      dispatchedAt:next.releaseDispatchedAt || null
    });
    next.releaseStatus = release;
    if (release?.state === 'released') next.phase = 'released';
  }

  next.updatedAt = Date.now();
  writeGitHubRepairState(next);
  return next;
}

async function getGitHubSelfRepairStatus() {
  const raw = readJson(settingsPath(), {});
  const token = unprotectSecret(raw.githubSelfRepairToken);
  const stored = readGitHubRepairState();
  if (!token) {
    return { connected:false, repo:githubSelfRepair.DEFAULT_REPO, repair:stored || null };
  }
  const client = githubSelfRepair.createGitHubSelfRepairClient({ token, repo:githubSelfRepair.DEFAULT_REPO });
  const connection = await client.validateConnection();
  let repair = stored || null;
  if (repair) repair = await syncGitHubRepairState();
  return { ...connection, repair };
}

async function abandonGitHubSelfRepair() {
  if (!localOwnerAuthorised()) throw new Error('MANUAL_REPAIR_UNAUTHORISED');
  const state = await syncGitHubRepairState();
  if (!state?.prNumber || !state?.headSha) throw new Error('GITHUB_REPAIR_STATE_MISSING');
  if (state.mergeSha || state.phase === 'merged' || state.phase === 'main-verified' || state.phase === 'release-dispatched' || state.phase === 'released') {
    throw new Error('GITHUB_REPAIR_ALREADY_MERGED');
  }
  await requireOwnerPresence({
    title:'Jarvis GitHub Self-Repair',
    message:'Elveted az aktív Self-Repair javítást?',
    detail:'A Pull Request bezárul és a hozzá tartozó javítási ág törlődik. Ez nem módosítja a main ágat.'
  });
  const client = getGitHubSelfRepairClient();
  await client.abandonRepair(state.prNumber,state.headSha);
  writeGitHubRepairState(null);
  return { abandoned:true, connected:true, repo:githubSelfRepair.DEFAULT_REPO };
}

async function mergeGitHubSelfRepair() {
  if (!localOwnerAuthorised()) throw new Error('MANUAL_REPAIR_UNAUTHORISED');
  const state = await syncGitHubRepairState();
  if (!state?.prNumber || !state?.headSha) throw new Error('GITHUB_REPAIR_STATE_MISSING');
  if (state.mergeSha) return state;
  if (state.prStatus?.ci?.state !== 'passed') throw new Error('GITHUB_REPAIR_CI_NOT_PASSED');
  await requireOwnerPresence({
    title:'Jarvis GitHub Self-Repair',
    message:'Beolvasztod az ellenőrzött Self-Repair PR-t a main ágba?',
    detail:'A pontos PR head SHA és a kötelező GitHub CI jobok már sikeresek. A következő lépés a main ág módosítása.'
  });
  const client = getGitHubSelfRepairClient();
  const merged = await client.mergeRepair(state.prNumber,state.headSha);
  const next = {
    ...state,
    phase:'merged',
    mergeSha:merged.mergeSha,
    mergedAt:Date.now()
  };
  writeGitHubRepairState(next);
  return syncGitHubRepairState();
}

async function publishGitHubSelfRepairRelease(allowUnsigned=false) {
  if (!localOwnerAuthorised()) throw new Error('MANUAL_REPAIR_UNAUTHORISED');
  const state = await syncGitHubRepairState();
  if (!state?.version || !state?.mergeSha) throw new Error('GITHUB_REPAIR_STATE_MISSING');
  if (state.phase === 'released') return state;
  if (state.mainStatus?.state !== 'current' || state.mainStatus?.ci?.state !== 'passed') {
    throw new Error('GITHUB_RELEASE_MAIN_CI_NOT_PASSED');
  }
  await requireOwnerPresence({
    title:'Jarvis új verzió kiadása',
    message:'Elindítod a GitHub Release publikálását?',
    detail:allowUnsigned
      ? 'Kifejezetten engedélyezted az aláírás nélküli kiadást. A SHA-256, manifest, main CI és minden más kiadási kapu továbbra is kötelező.'
      : 'A main teljes CI-je sikeres. Érvényes Authenticode aláírás nélkül a publikálás meg fog állni.'
  });
  const client = getGitHubSelfRepairClient();
  const dispatch = await client.dispatchRelease({
    version:state.version,
    mergeSha:state.mergeSha,
    allowUnsigned:Boolean(allowUnsigned)
  });
  const next = {
    ...state,
    phase:dispatch.alreadyReleased ? 'released' : 'release-dispatched',
    releaseDispatchedAt:dispatch.dispatchedAt || state.releaseDispatchedAt || new Date().toISOString(),
    unsignedReleaseApproved:Boolean(allowUnsigned)
  };
  writeGitHubRepairState(next);
  return syncGitHubRepairState();
}

async function deleteAllLocalData() {
  const userData = app.getPath('userData');
  const backupDirectory = path.join(app.getPath('documents'), 'Jarvis Backups');
  const failures = [];

  try { database?.close?.(); } catch (error) {
    failures.push({ target:'database-close', error:String(error?.message || error) });
  }
  database = null;

  const targets = [
    path.join(userData, 'data'),
    path.join(userData, 'audit'),
    path.join(userData, 'security'),
    developerBackupRoot(),
    path.join(userData, 'self-repair-learning.json'),
    path.join(userData, 'crash-watchdog'),
    manualRepairRoot(),
    settingsPath(),
    backupDirectory,
  ];
  for (const target of targets) {
    try {
      fs.rmSync(target, { recursive:true, force:true });
      if (fs.existsSync(target)) failures.push({ target, error:'DELETE_VERIFICATION_FAILED' });
    } catch (error) {
      failures.push({ target, error:String(error?.message || error) });
    }
  }

  try { await session.defaultSession.clearStorageData(); } catch (error) {
    failures.push({ target:'electron-storage', error:String(error?.message || error) });
  }
  try { await session.defaultSession.clearCache(); } catch (error) {
    failures.push({ target:'electron-cache', error:String(error?.message || error) });
  }

  if (failures.length) {
    try { database = new LocalDatabase(path.join(userData, 'data', 'jarvis.sqlite3')); } catch {}
    return { data:{ success:false, localOnly:true, restartRequired:false, erased:false, failures } };
  }

  setTimeout(() => {
    try { app.relaunch(); } catch {}
    app.exit(0);
  }, 700);

  return { data:{ success:true, localOnly:true, restartRequired:true, erased:true, failures:[] } };
}

async function withNetworkTimeout(timeoutMs, label, operation) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || 15000));
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${label}_TIMEOUT`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function openRouterRequest(payload={}) {
  const requestOrigin = String(payload?.request_origin || payload?.requestOrigin || '').trim().toLowerCase();
  const isConversationRequest = requestOrigin === 'conversation';
  if (!isConversationRequest && payloadContainsSensitiveContext(payload)) {
    await enforcePolicy({
      type:'external_ai_sensitive_context',
      target:'openrouter.ai',
      authorised:localOwnerAuthorised(),
      transmitsSensitiveData:true
    }, {
      message:'Jarvis érzékeny helyi adatokat készül elküldeni az OpenRouter AI szolgáltatásnak.'
    });
  }
  const raw = readJson(settingsPath(), {});
  const apiKey = unprotectSecret(raw.openRouterKey);
  if (!apiKey) throw new Error('OPENROUTER_API_KEY_REQUIRED');
  const requestedModel = String(payload.model || '').trim();
  const routingMode = String(raw.aiRoutingMode || 'smart');
  const taskType = String(payload.task_type || payload.taskType || 'general').toLowerCase();
  const taskTier = ['code','coding','repair','development','reasoning','analysis'].includes(taskType) ? 'medium' : 'low';
  const requestedTier = String(payload.cost_tier || raw.aiCostTier || taskTier);
  const allowedTiers = new Set(['low','medium','high','xhigh','max']);
  const costTier = allowedTiers.has(requestedTier) ? requestedTier : taskTier;
  const configuredModel = String(raw.aiModel || 'openrouter/auto').trim() || 'openrouter/auto';
  const model = requestedModel.includes('/')
    ? requestedModel
    : configuredModel;
  const effectiveRoutingMode = model === 'openrouter/auto' ? 'smart' : 'manual';

  let messages = Array.isArray(payload.messages) && payload.messages.length
    ? payload.messages.map((message) => ({ ...message }))
    : [{ role:'user', content:String(payload.prompt || '') }];

  const imageUrls = [
    ...(Array.isArray(payload.file_urls) ? payload.file_urls : []),
    ...(Array.isArray(payload.image_urls) ? payload.image_urls : []),
  ].filter((url) => typeof url === 'string' && url.trim());

  if (imageUrls.length > 0) {
    const imageParts = imageUrls.slice(0, 20).map((url) => ({
      type:'image_url',
      image_url:{ url }
    }));
    let userIndex = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'user') { userIndex = i; break; }
    }
    if (userIndex < 0) {
      messages.push({ role:'user', content:[{ type:'text', text:String(payload.prompt || '') }, ...imageParts] });
    } else {
      const current = messages[userIndex].content;
      const textParts = Array.isArray(current)
        ? current
        : [{ type:'text', text:String(current ?? payload.prompt ?? '') }];
      messages[userIndex] = { ...messages[userIndex], content:[...textParts, ...imageParts] };
    }
  }

  const body = { model, messages, usage:{ include:true } };
  if (model === 'openrouter/auto') body.cost_tier = costTier;
  if (payload.response_json_schema) body.response_format = { type:'json_object' };
  const controller = new AbortController();
  const timeoutMs = Math.min(
    180000,
    Math.max(10000, Number(payload.timeout_ms || payload.timeoutMs) || (taskType === 'repair' ? 120000 : 75000))
  );
  let timedOut = false;
  let externalAbort = null;
  if (payload.signal?.addEventListener) {
    externalAbort = () => controller.abort();
    if (payload.signal.aborted) controller.abort();
    else payload.signal.addEventListener('abort', externalAbort, { once:true });
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method:'POST',
      signal:controller.signal,
      headers:{
        'Authorization':`Bearer ${apiKey}`,
        'Content-Type':'application/json',
        'HTTP-Referer':'https://jarvis.local',
        'X-Title':'Jarvis Desktop'
      },
      body:JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`OPENROUTER_${res.status}:${(await res.text()).slice(0,500)}`);
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? '';
    let result = content;
    if (payload.response_json_schema) {
      try { result = JSON.parse(content); } catch {}
    }
    return { success:true, data:{
      result,
      model:json.model || model,
      requestedModel:model,
      routingMode:effectiveRoutingMode,
      costTier,
      usage:json.usage || null,
      cost:Number(json?.usage?.cost ?? 0) || 0
    } };
  } catch (error) {
    if (error?.name === 'AbortError') {
      if (payload.signal?.aborted && !timedOut) throw new Error('OPENROUTER_ABORTED');
      throw new Error(`OPENROUTER_TIMEOUT_${timeoutMs}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (externalAbort) payload.signal?.removeEventListener?.('abort', externalAbort);
  }
}

async function testOpenRouterConnection(candidateApiKey = '') {
  const raw = readJson(settingsPath(), {});
  const apiKey = String(candidateApiKey || '').trim() || unprotectSecret(raw.openRouterKey);
  if (!apiKey) throw new Error('OPENROUTER_API_KEY_REQUIRED');
  return withNetworkTimeout(15000, 'OPENROUTER_CONNECTION', async (signal) => {
    const response = await fetch('https://openrouter.ai/api/v1/models?sort=most-popular', {
      signal,
      headers:{ Authorization:`Bearer ${apiKey}`, 'User-Agent':'Jarvis-Desktop' }
    });
    if (!response.ok) throw new Error(`OPENROUTER_CONNECTION_${response.status}`);
    const json = await response.json();
    const models = Array.isArray(json?.data) ? json.data : [];
    return { success:true, modelCount:models.length, routingMode:raw.aiRoutingMode || 'smart', costTier:raw.aiCostTier || 'low' };
  });
}

async function listOpenRouterImageModels(apiKey) {
  return withNetworkTimeout(15000, 'OPENROUTER_IMAGE_MODELS', async (signal) => {
    const response = await fetch('https://openrouter.ai/api/v1/images/models', {
      signal,
      headers:{ Authorization:`Bearer ${apiKey}`, 'User-Agent':'Jarvis-Desktop' }
    });
    if (!response.ok) throw new Error(`OPENROUTER_IMAGE_MODELS_${response.status}`);
    const json = await response.json();
    return Array.isArray(json?.data) ? json.data : [];
  });
}

async function openRouterGenerateImage(payload={}) {
  const raw = readJson(settingsPath(), {});
  const apiKey = unprotectSecret(raw.openRouterKey);
  if (!apiKey) throw new Error('OPENROUTER_API_KEY_REQUIRED');
  const prompt = String(payload.prompt || '').trim();
  if (!prompt) throw new Error('IMAGE_PROMPT_REQUIRED');

  const models = await listOpenRouterImageModels(apiKey);
  const ids = new Set(models.map((item) => item?.id).filter(Boolean));
  const requested = String(payload.model || raw.imageModel || '').trim();
  const candidates = [
    requested,
    'openai/gpt-5-image-mini',
    'bytedance-seed/seedream-4.5',
    ...models.map((item) => item?.id),
  ].filter(Boolean);
  const model = candidates.find((id) => ids.has(id));
  if (!model) throw new Error('OPENROUTER_IMAGE_MODEL_NOT_AVAILABLE');

  const body = { model, prompt, n:1 };
  const references = Array.isArray(payload.existing_image_urls)
    ? payload.existing_image_urls.filter((url) => typeof url === 'string' && url.trim()).slice(0, 5)
    : [];
  if (references.length) {
    body.input_references = references.map((url) => ({
      type:'image_url',
      image_url:{ url }
    }));
  }

  return withNetworkTimeout(120000, 'OPENROUTER_IMAGE', async (signal) => {
    const response = await fetch('https://openrouter.ai/api/v1/images', {
      method:'POST',
      signal,
      headers:{
        'Authorization':`Bearer ${apiKey}`,
        'Content-Type':'application/json',
        'HTTP-Referer':'https://jarvis.local',
        'X-Title':'Jarvis Desktop'
      },
      body:JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`OPENROUTER_IMAGE_${response.status}:${(await response.text()).slice(0,500)}`);
    const json = await response.json();
    const image = json?.data?.[0];
    if (!image?.b64_json) throw new Error('OPENROUTER_IMAGE_DATA_MISSING');
    const mediaType = image.media_type || 'image/png';
    return {
      success:true,
      data:{
        url:`data:${mediaType};base64,${image.b64_json}`,
        model,
        mediaType,
        usage:json.usage || null
      }
    };
  });
}

function getOpenRouterAudioCredentials() {
  const raw = readJson(settingsPath(), {});
  const apiKey = unprotectSecret(raw.openRouterKey);
  if (!apiKey) throw new Error('OPENROUTER_API_KEY_REQUIRED');
  return { raw, apiKey };
}

async function listOpenRouterSpeechModels() {
  const raw = readJson(settingsPath(), {});
  const apiKey = unprotectSecret(raw.openRouterKey);
  const headers = apiKey ? { Authorization:`Bearer ${apiKey}` } : {};
  return withNetworkTimeout(15000, 'OPENROUTER_SPEECH_MODELS', async (signal) => {
    const response = await fetch('https://openrouter.ai/api/v1/models?output_modalities=speech', { headers, signal });
    if (!response.ok) throw new Error(`OPENROUTER_SPEECH_MODELS_${response.status}`);
    const json = await response.json();

    return (json.data || [])
      .filter((model) => Array.isArray(model?.supported_voices) && model.supported_voices.length > 0)
      .map((model) => ({
        id:model.id,
        name:model.name || model.id,
        voices:model.supported_voices,
        pricing:model.pricing || null,
        context_length:model.context_length || null
      }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  });
}

function audioFormatFromMimeType(mimeType='') {
  const value = String(mimeType || '').toLowerCase();
  if (value.includes('webm')) return 'webm';
  if (value.includes('wav')) return 'wav';
  if (value.includes('mpeg') || value.includes('mp3')) return 'mp3';
  if (value.includes('flac')) return 'flac';
  if (value.includes('ogg')) return 'ogg';
  if (value.includes('m4a') || value.includes('mp4')) return 'm4a';
  if (value.includes('aac')) return 'aac';
  return 'webm';
}

function parsePcmContentType(contentType='') {
  const rateMatch = String(contentType).match(/rate=(\d+)/i);
  const channelMatch = String(contentType).match(/channels=(\d+)/i);
  return {
    sampleRate:Number(rateMatch?.[1] || 24000),
    channels:Number(channelMatch?.[1] || 1),
  };
}

function pcm16ToWav(pcmBuffer, sampleRate=24000, channels=1) {
  const bitsPerSample = 16;
  const header = Buffer.alloc(44);
  const dataLength = pcmBuffer.length;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);
  return Buffer.concat([header, pcmBuffer]);
}

function openRouterAudioHeaders(apiKey) {
  return {
    'Authorization':`Bearer ${apiKey}`,
    'Content-Type':'application/json',
    'HTTP-Referer':'https://jarvis.local',
    'X-Title':'Jarvis Desktop'
  };
}

async function openRouterTranscribeVoice(payload={}) {
  const { raw, apiKey } = getOpenRouterAudioCredentials();
  const model = String(raw.sttModel || DEFAULT_STT_MODEL);

  if (payload.warmup === true) {
    return { data:{ supported:true, model, text:'' } };
  }

  const audioBase64 = String(payload.audioBase64 || '').trim();
  if (!audioBase64) throw new Error('VOICE_AUDIO_REQUIRED');
  if (audioBase64.length > 24 * 1024 * 1024) throw new Error('VOICE_AUDIO_TOO_LARGE');

  const format = audioFormatFromMimeType(payload.mimeType);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
      method:'POST',
      headers:openRouterAudioHeaders(apiKey),
      signal:controller.signal,
      body:JSON.stringify({
        model,
        input_audio:{ data:audioBase64, format }
      })
    });

    if (!response.ok) {
      throw new Error(`OPENROUTER_STT_${response.status}:${(await response.text()).slice(0,500)}`);
    }

    const json = await response.json();
    return {
      data:{
        supported:true,
        text:String(json?.text || '').trim(),
        model,
        usage:json?.usage || null,
        generationId:response.headers.get('x-generation-id') || null
      }
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('OPENROUTER_STT_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestOpenRouterSpeech({ apiKey, model, voice, input, responseFormat }) {
  const retryable = new Set([429, 502, 503, 524, 529]);
  let last = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await withNetworkTimeout(45000, 'OPENROUTER_TTS', async (signal) => {
        const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
          method:'POST',
          signal,
          headers:openRouterAudioHeaders(apiKey),
          body:JSON.stringify({
            model,
            input,
            voice,
            response_format:responseFormat
          })
        });

        if (!response.ok) {
          return {
            ok:false,
            status:response.status,
            errorBody:(await response.text()).slice(0,700)
          };
        }

        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        const audioBuffer = Buffer.from(await response.arrayBuffer());
        return {
          ok:true,
          status:response.status,
          contentType,
          audioBuffer,
          generationId:response.headers.get('x-generation-id') || null
        };
      });

      if (result.ok) return result;
      last = { status:result.status, errorBody:result.errorBody };
    } catch (error) {
      last = { status:0, errorBody:String(error?.message || error) };
    }

    const canRetry = retryable.has(last.status) || last.errorBody === 'OPENROUTER_TTS_TIMEOUT';
    if (!canRetry || attempt > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
  }

  return { ok:false, ...(last || { status:500, errorBody:'UNKNOWN_TTS_ERROR' }) };
}

async function openRouterSynthesizeVoice(payload={}) {
  const { raw, apiKey } = getOpenRouterAudioCredentials();
  const requestedModel = String(raw.ttsModel || DEFAULT_TTS_MODEL);
  const requestedVoice = String(raw.ttsVoice || DEFAULT_TTS_VOICE);
  const gender = raw.ttsGender === 'female' ? 'female' : 'male';
  const defaultGenderVoice = gender === 'female' ? 'Kore' : 'Charon';
  const input = String(payload.text || '').trim();

  if (payload.warmup === true) {
    return { data:{ supported:true, model:requestedModel, voice:requestedVoice, audioBase64:null } };
  }
  if (!input) throw new Error('VOICE_TEXT_REQUIRED');

  const requestedIsGoogle = requestedModel.startsWith('google/gemini-') && GOOGLE_TTS_VOICES.has(requestedVoice);
  const fallbackVoice = requestedIsGoogle ? requestedVoice : defaultGenderVoice;
  const candidates = [
    { model:requestedModel, voice:requestedVoice },
    { model:DEFAULT_TTS_MODEL, voice:fallbackVoice },
    { model:FALLBACK_TTS_MODEL, voice:fallbackVoice }
  ].filter((candidate, index, all) =>
    all.findIndex((item) => item.model === candidate.model && item.voice === candidate.voice) === index
  );
  let lastError = 'MODEL_TTS_UNAVAILABLE';

  for (const candidate of candidates) {
    const { model, voice } = candidate;
    for (const responseFormat of ['mp3', 'pcm']) {
      const attempt = await requestOpenRouterSpeech({ apiKey, model, voice, input, responseFormat });
      if (!attempt.ok) {
        lastError = `OPENROUTER_TTS_${attempt.status}:${attempt.errorBody}`;
        continue;
      }

      const contentType = attempt.contentType;
      let audioBuffer = attempt.audioBuffer;
      if (!audioBuffer.length) {
        lastError = 'OPENROUTER_TTS_EMPTY_AUDIO';
        continue;
      }

      let mimeType = contentType.split(';')[0] || (responseFormat === 'mp3' ? 'audio/mpeg' : 'audio/pcm');
      if (mimeType.includes('application/json')) {
        lastError = 'OPENROUTER_TTS_JSON_INSTEAD_OF_AUDIO';
        continue;
      }

      if (mimeType === 'audio/pcm' || responseFormat === 'pcm') {
        const { sampleRate, channels } = parsePcmContentType(contentType);
        audioBuffer = pcm16ToWav(audioBuffer, sampleRate, channels);
        mimeType = 'audio/wav';
      }

      return {
        data:{
          supported:true,
          audioBase64:audioBuffer.toString('base64'),
          mimeType,
          model,
          voice,
          generationId:attempt.generationId
        }
      };
    }
  }

  throw new Error(lastError);
}

async function getSelfRepairRoot() {
  return ensureManualRepairWorkspace();
}

async function selfRepairMap(payload={}) {
  const workspace = await getSelfRepairRoot();
  const context = developerRepair.buildDiagnosticContext(workspace, String(payload?.query || ''), { maxFiles:12, maxChars:26000 });
  return {
    data:{
      map:context.map,
      learning:selfRepairLearning?.stats?.() || { entries:0, successful:0, lastVerified:null },
      admin:adminDiagnosticsManager?.status?.() || { active:false, expiresAt:null },
      scannedAt:new Date().toISOString()
    }
  };
}

async function selfRepairChat(payload={}) {
  if (manualRepairApplyInFlight) throw new Error('MANUAL_REPAIR_ALREADY_IN_PROGRESS');
  const message = String(payload?.message || '').trim();
  if (!message) throw new Error('SELF_REPAIR_MESSAGE_REQUIRED');
  // A new owner request makes all previous unaccepted proposals obsolete.
  clearPendingManualRepairPlans();
  const language = String(payload?.language || 'hu').toLowerCase();
  const history = Array.isArray(payload?.history) ? payload.history.slice(-10) : [];
  const workspace = await getSelfRepairRoot();
  const contextQuery = [
    message,
    ...history.slice(-4).map((item) => String(item?.content || '').slice(0,2400))
  ].join('\n');
  const context = developerRepair.buildDiagnosticContext(workspace, contextQuery, { maxFiles:20, maxChars:62000 });
  const learned = selfRepairLearning?.relevant?.(message, 8) || [];
  const learnedText = learned.length
    ? learned.map((item) => `- ${item.title} | files=${(item.files || []).join(', ')} | evidence=${item.evidence || '-'} | validation=${item.validation || '-'}`).join('\n')
    : '(no verified prior lessons)';
  const mapSummary = JSON.stringify(context.map, null, 2);
  const excerpts = context.excerpts.map((item) =>
    `--- ${item.path} (score=${item.score}, lines=${item.lines}) ---\n${item.excerpt}`
  ).join('\n\n');
  const historyText = history.map(item => `${item.role === 'assistant' ? 'Jarvis Self-Repair' : 'Owner'}: ${String(item.content || '').slice(0,1800)}`).join('\n');
  let adminSystemText = '(administrator diagnostics session is not active)';
  if (adminDiagnosticsManager?.isActive?.()) {
    try {
      const snapshot = await adminDiagnosticsManager.snapshot();
      adminSystemText = JSON.stringify(snapshot, null, 2).slice(0,42000);
    } catch (error) {
      adminSystemText = '(administrator diagnostics unavailable: ' + String(error?.message || error) + ')';
    }
  }
  const currentAppVersion = String(app.getVersion?.() || 'unknown');
  const crashHistory = readRecentCrashes(20)
    .filter((item) => canonicalAppVersion(item?.appVersion) === canonicalAppVersion(currentAppVersion))
    .slice(0,8);
  const crashText = crashHistory.length
    ? JSON.stringify(crashHistory,null,2).slice(0,18000)
    : `(no crash records for current app version ${currentAppVersion})`;
  const langRule = language === 'hu'
    ? 'Válaszolj kizárólag magyarul.'
    : 'Reply in the selected application language when possible.';

  const prompt = `You are Jarvis Self-Repair, a source-aware software diagnostic engineer embedded in the Jarvis Windows app.
You are NOT limited to reading filenames: reason about architecture, imports, state flow, IPC boundaries, UI behavior, tests and likely failure modes.
Use only evidence from the project map and source excerpts below. Clearly separate confirmed code facts from hypotheses.
You may propose concrete file-level repairs and validation steps. Repairs are manual and owner-approved: never apply a change until the owner presses the explicit Accept button. Do not start background repair loops or hidden execution. Never claim that a proposed change has already been applied.
When asked to find bugs, inspect interactions across files, not just isolated syntax.
Follow dependency edges, route reachability and IPC channels before claiming that code is active.
Treat files marked inactive-or-unreferenced as dormant unless another runtime path proves otherwise.
Crash Watchdog evidence is restricted to the currently installed app version. Do not diagnose a historical crash from an older version as a current defect.
If a prior lesson describes a bug that the current source already fixes, explicitly mark it as historical/resolved instead of proposing the same repair again.
If evidence is missing, follow the related dependency/IPC chain already included in the context before stopping.
Use VERIFIED LOCAL LESSONS only as prior validated evidence, never as authority over current source.
${langRule}

VERIFIED LOCAL LESSONS:
${learnedText}

UAC-AUTHORIZED WINDOWS DIAGNOSTICS:
${adminSystemText}

CRASH WATCHDOG HISTORY:
${crashText}

PROJECT MAP:
${mapSummary}

RELEVANT SOURCE:
${excerpts}

CONVERSATION:
${historyText}

OWNER:
${message}

Return a practical answer with:
- diagnosis / interpretation,
- concrete evidence (file names),
- likely cause(s),
- repair proposal,
- how to validate.
Keep it concise unless the owner asks for deep detail.`;

  const response = await openRouterRequest({
    prompt,
    task_type:'repair',
    timeout_ms:90000,
    contains_sensitive_context:Boolean(adminDiagnosticsManager?.isActive?.() || crashHistory.length)
  });

  let pendingRepair = null;
  const explicitRepairRequest = developerRepair.isExplicitRepairRequest(message);
  if (explicitRepairRequest) {
    const source = context.excerpts.map((item) =>
      `--- ${item.path} [${item.protected ? 'OWNER-BLOCKED-OR-CORE' : 'EDITABLE'}] ---\n${item.excerpt}`
    ).join('\n\n');
    const planPrompt = `You are preparing a MANUAL, owner-approved Jarvis repair plan.
The owner explicitly asked to fix the issue. Create the smallest concrete patch from the exact current source below.
The patch will NOT be sent to GitHub until the owner presses Accept. After approval, Jarvis applies it only inside an isolated local staging workspace, runs the full local validation suite, captures the exact validated file bytes, restores the staging workspace, and then creates a dedicated GitHub repair branch and Pull Request. The installed Jarvis remains unchanged until the independently verified GitHub repair is merged, released and installed as a normal update.
Rules:
- Return JSON only with goal, rationale, risk and patches.
- Copy every search string exactly from CURRENT SOURCE. Do not invent or paraphrase search text.
- Repair ordinary application/module source only. The Self-Repair trust core is intentionally immutable to AI patches.
- Never target electron/main.cjs, electron/developer-repair.cjs, electron/github-self-repair.cjs, electron/preload.cjs, electron/admin-diagnostics.cjs, security/**, electron/security/**, .github/**, scripts/**, package.json, package-lock.json, src/lib/appVersion.js, release-notes/**, eslint.config.js, tsconfig.json, vite.config.js, or src/tests/**.
- Prefer exact replacements over whole-file replacement.
- Maximum 6 files and 8 replacements per file.
- Do not change release/version metadata.
- If no safe concrete patch can be formed from the supplied source, return {"goal":"...","rationale":"NO_SAFE_PATCH: explain why","risk":"high","patches":[]}.

OWNER REQUEST:
${message}

DIAGNOSTIC ANSWER:
${String(response?.data?.result || '').slice(0,10000)}

CURRENT SOURCE:
${source}`;

    try {
      const planResponse = await openRouterRequest({
        prompt:planPrompt,
        task_type:'repair',
        response_json_schema:{type:'object'},
        timeout_ms:120000,
        contains_sensitive_context:false
      });
      const proposal = parseRepairModelJson(planResponse?.data?.result);
      if (Array.isArray(proposal?.patches) && proposal.patches.length) {
        const plan = developerRepair.validateOwnerPlan(workspace,{
          goal:proposal.goal || message,
          rationale:proposal.rationale || 'Owner-requested manual Self-Repair',
          risk:proposal.risk || 'medium',
          patches:proposal.patches
        });
        const planEntry = {workspace,plan,createdAt:Date.now()};
        manualRepairPlans.set(plan.hash,planEntry);
        persistManualRepairPlan(planEntry);
        pendingRepair = {
          hash:plan.hash,
          goal:plan.goal,
          rationale:plan.rationale,
          risk:plan.risk,
          files:plan.patches.map((patch)=>patch.file)
        };
      }
    } catch (error) {
      pendingRepair = {
        error:String(error?.message || error)
      };
    }
  }

  return {
    data:{
      reply:String(response?.data?.result || '').trim(),
      model:response?.data?.model || null,
      requestedModel:response?.data?.requestedModel || null,
      map:context.map,
      files:context.excerpts.map(item=>item.path),
      pendingRepair
    }
  };
}


function parseRepairModelJson(value) {
  if (value && typeof value === 'object') return value;
  const raw = String(value || '').trim();
  if (!raw) throw new Error('MANUAL_REPAIR_EMPTY_MODEL_RESPONSE');
  const cleaned = raw
    .replace(/^\`\`\`(?:json)?\s*/i,'')
    .replace(/\s*\`\`\`$/,'')
    .trim();
  try { return JSON.parse(cleaned); }
  catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start,end+1));
    throw new Error('MANUAL_REPAIR_INVALID_JSON');
  }
}

async function openRouterObdDiagnosis(payload={}) {
  const prompt = [
    'You are a cautious automotive diagnostic assistant.',
    'Explain DTC codes, likely causes, safe checks, urgency and uncertainty.',
    'Do not claim a repair is confirmed from codes alone.',
    'Return plain text in Hungarian unless the supplied vehicle context clearly requests another language.',
    '',
    'DTC codes: ' + JSON.stringify(payload.dtc_codes || []),
    'RPM data: ' + JSON.stringify(payload.rpm_data || []),
    'Temperature data: ' + JSON.stringify(payload.temperature_data || []),
    'Vehicle: ' + JSON.stringify(payload.vehicle_info || {}),
  ].join('\n');
  const response = await openRouterRequest({ prompt, ...(payload.model ? { model:payload.model } : {}) });
  return { data:{ diagnosis:String(response?.data?.result || ''), model:response?.data?.model || null } };
}

async function invokeJarvisFunction(name, payload={}) {
  switch (name) {
    case 'llmProxy': return openRouterRequest(payload);
    case 'runAiTask': {
      const r = await openRouterRequest(payload);
      return { data:{ result:r.data.result, model:r.data.model, usage:r.data.usage } };
    }
    case 'validateFileUpload':
      return { data:validateUploadedFileUrl(payload?.file_url ?? payload?.url) };
    case 'generateImage': return openRouterGenerateImage(payload);
    case 'gmailFetch':
      return { data:{ emails:[], connected:false, configured:false, capabilities:[], reason:'GMAIL_OAUTH_NOT_CONFIGURED' } };
    case 'gmailSend':
      return { data:{ success:false, configured:false, reason:'GMAIL_OAUTH_NOT_CONFIGURED' } };
    case 'transcribeVoice':
      return openRouterTranscribeVoice(payload);
    case 'synthesizeVoice':
      return openRouterSynthesizeVoice(payload);
    case 'selfRepairMap':
      return selfRepairMap(payload);
    case 'selfRepairChat':
      return selfRepairChat(payload);
    case 'generateOBDDiagnosis':
      return openRouterObdDiagnosis(payload);
    case 'analyzeUploadedFiles': return { data:analyzeUploadedFiles(payload?.files || []) };
    case 'analyzeProjectDeep': return { data:analyzeProjectDeep(payload?.files || []) };
    case 'analyzeProjectSpecialists': return { data:analyzeProjectSpecialists(payload?.files || []) };
    case 'sendFeedback': {
      const created = database.create('AiFeedback', payload || {});
      return { data:{ success:true, storedLocally:true, created } };
    }
    case 'getAiFeedbackAdminData':
      return { data:{
        feedback:database.filter('AiFeedback', {}, '-created_date', 200),
        tunings:database.filter('PromptTuning', {}, '-created_date', 200)
      } };
    case 'createPromptTuning': {
      const created = database.create('PromptTuning', { ...payload, status:payload?.status || 'pending' });
      return { data:{ created } };
    }
    case 'updatePromptTuning': {
      if (!payload?.id) throw new Error('PROMPT_TUNING_ID_REQUIRED');
      const { id, ...patch } = payload;
      const updated = database.update('PromptTuning', id, patch);
      return { data:{ updated } };
    }
    case 'getActivePromptTunings':
      return { data:{ tunings:database.filter('PromptTuning', { status:'active' }, '-updated_date', 50) } };
    case 'deleteAccount':
      return deleteAllLocalData();
    default: throw new Error(`JARVIS_FUNCTION_NOT_IMPLEMENTED:${name}`);
  }
}

async function getWindowsDetails() {
  if (process.platform !== 'win32') return {};
  const ps = [
    '$os=Get-CimInstance Win32_OperatingSystem;',
    '$cs=Get-CimInstance Win32_ComputerSystem;',
    '$gpu=Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name;',
    '$d=Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,Size,FreeSpace;',
    '[pscustomobject]@{Caption=$os.Caption;Version=$os.Version;Build=$os.BuildNumber;Manufacturer=$cs.Manufacturer;Model=$cs.Model;GPU=$gpu;Drives=$d}|ConvertTo-Json -Depth 4 -Compress'
  ].join('');
  try {
    const { stdout } = await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',ps],{timeout:8000,windowsHide:true});
    return JSON.parse(stdout.trim());
  } catch { return {}; }
}

async function getSystemContext() {
  const win = await getWindowsDetails();
  return {
    platform:process.platform,
    arch:process.arch,
    release:os.release(),
    hostname:os.hostname(),
    username:os.userInfo().username,
    cpu:os.cpus()?.[0]?.model || '',
    cpuCores:os.cpus()?.length || 0,
    totalMemoryBytes:os.totalmem(),
    freeMemoryBytes:os.freemem(),
    homeDirectory:os.homedir(),
    tempDirectory:os.tmpdir(),
    appVersion:app.getVersion(),
    elevatedExpected:false,
    windows:win
  };
}


const UPDATE_REPO = 'bigzsorzs-sketch/jarvis-windows-v0.1';
const UPDATE_API = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;

function normalizeVersion(value='0.0.0') {
  return String(value).replace(/^v/i,'').split('-')[0].split('.').map(x => Number.parseInt(x,10) || 0);
}
function compareVersions(a,b) {
  const av=normalizeVersion(a), bv=normalizeVersion(b);
  const n=Math.max(av.length,bv.length);
  for(let i=0;i<n;i+=1){ const d=(av[i]||0)-(bv[i]||0); if(d) return d>0?1:-1; }
  return 0;
}
async function fetchLatestRelease() {
  return withNetworkTimeout(15000, 'UPDATE_CHECK', async (signal) => {
    const res=await fetch(UPDATE_API,{
      signal,
      headers:{'Accept':'application/vnd.github+json','User-Agent':'Jarvis-Desktop-Updater'}
    });
    if(!res.ok) throw new Error(`UPDATE_CHECK_${res.status}`);
    const release=await res.json();
    if (release.draft || release.prerelease) throw new Error('UPDATE_RELEASE_NOT_STABLE');
    const latestVersion=String(release.tag_name||'').replace(/^v/i,'');
    if (!/^\d+\.\d+\.\d+$/.test(latestVersion)) throw new Error('UPDATE_VERSION_INVALID');
    const expectedInstallerName=`Jarvis-Setup-${latestVersion}-x64.exe`;
    const exe=(release.assets||[]).find(a => String(a.name||'').toLowerCase() === expectedInstallerName.toLowerCase());
    if(!exe) throw new Error('UPDATE_INSTALLER_NOT_FOUND');
    const checksum=(release.assets||[]).find(a => String(a.name||'').toLowerCase() === `${expectedInstallerName}.sha256`.toLowerCase());
    if(!checksum) throw new Error('UPDATE_CHECKSUM_NOT_FOUND');
    const manifest=(release.assets||[]).find(a => String(a.name||'').toLowerCase() === 'release-manifest.json');
    if(!manifest) throw new Error('UPDATE_MANIFEST_NOT_FOUND');
    return {
      latestVersion,
      releaseName:release.name||release.tag_name,
      publishedAt:release.published_at,
      targetCommitish:String(release.target_commitish || ''),
      exe,
      checksum,
      manifest
    };
  });
}

async function downloadFile(url,destination) {
  return withNetworkTimeout(10 * 60 * 1000, 'UPDATE_DOWNLOAD', async (signal) => {
    const res=await fetch(url,{redirect:'follow',signal,headers:{'User-Agent':'Jarvis-Desktop-Updater'}});
    if(!res.ok || !res.body) throw new Error(`UPDATE_DOWNLOAD_${res.status}`);
    await pipeline(Readable.fromWeb(res.body),fs.createWriteStream(destination));
  });
}

async function sha256File(file) {
  return new Promise((resolve,reject)=>{
    const h=crypto.createHash('sha256');
    const s=fs.createReadStream(file);
    s.on('error',reject); s.on('data',d=>h.update(d)); s.on('end',()=>resolve(h.digest('hex').toLowerCase()));
  });
}
function psQuote(value) { return String(value).replace(/'/g,"''"); }

async function getAuthenticodeSignature(filePath) {
  if (process.platform !== 'win32') return { status:'Unsupported', thumbprint:'', subject:'' };
  const ps = "$s=Get-AuthenticodeSignature -LiteralPath '" + psQuote(filePath) + "'; [pscustomobject]@{Status=[string]$s.Status;Thumbprint=if($s.SignerCertificate){$s.SignerCertificate.Thumbprint}else{''};Subject=if($s.SignerCertificate){$s.SignerCertificate.Subject}else{''}} | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',ps], { timeout:8000, windowsHide:true });
  return JSON.parse(stdout.trim());
}

async function verifyUpdateSigner(installerPath) {
  const current = await getAuthenticodeSignature(process.execPath);
  const next = await getAuthenticodeSignature(installerPath);
  const currentSigned = current.status === 'Valid' && Boolean(current.thumbprint);
  const nextSigned = next.status === 'Valid' && Boolean(next.thumbprint);

  // Once Jarvis is code-signed, never permit an unsigned update or a signer change.
  if (currentSigned) {
    if (!nextSigned) throw new Error('UPDATE_SIGNER_UNVERIFIED');
    if (String(current.thumbprint).toUpperCase() !== String(next.thumbprint).toUpperCase()) {
      throw new Error('UPDATE_SIGNER_MISMATCH');
    }
    return { ...next, verification:'authenticode' };
  }

  // Existing community builds are unsigned. Their update trust anchor is the
  // mandatory SHA-256 asset from the stable GitHub Release. If a future update
  // is signed, report that fact and preserve the stricter policy thereafter.
  return { ...next, verification:nextSigned ? 'sha256+authenticode' : 'sha256' };
}

async function oneClickUpdate() {
  const currentVersion=app.getVersion();
  const release=await fetchLatestRelease();
  if(compareVersions(release.latestVersion,currentVersion)<=0) {
    return {status:'up-to-date',currentVersion,latestVersion:release.latestVersion};
  }

  const tempDir=path.join(app.getPath('temp'),`Jarvis-Upgrade-${release.latestVersion}`);
  fs.rmSync(tempDir,{recursive:true,force:true});
  fs.mkdirSync(tempDir,{recursive:true});
  const installerPath=path.join(tempDir,release.exe.name);
  const checksumPath=`${installerPath}.sha256`;
  const manifestPath=path.join(tempDir,'release-manifest.json');

  await downloadFile(release.exe.browser_download_url,installerPath);
  await downloadFile(release.checksum.browser_download_url,checksumPath);
  await downloadFile(release.manifest.browser_download_url,manifestPath);

  const checksumText=fs.readFileSync(checksumPath,'utf8');
  const expected=(checksumText.match(/\b[a-f0-9]{64}\b/i)||[])[0]?.toLowerCase();
  if(!expected) throw new Error('UPDATE_CHECKSUM_INVALID');
  const actual=await sha256File(installerPath);
  if(actual!==expected) {
    try { fs.unlinkSync(installerPath); } catch {}
    throw new Error('UPDATE_CHECKSUM_MISMATCH');
  }

  let releaseManifest;
  try {
    releaseManifest=JSON.parse(fs.readFileSync(manifestPath,'utf8').replace(/^\uFEFF/,''));
  } catch {
    throw new Error('UPDATE_MANIFEST_INVALID');
  }
  githubSelfRepair.verifyReleaseManifest(releaseManifest,{
    version:release.latestVersion,
    installer:release.exe.name,
    sha256:actual,
    targetCommitish:release.targetCommitish
  });

  const signer = await verifyUpdateSigner(installerPath);

  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const backupRoot=path.join(app.getPath('documents'),'Jarvis Backups',stamp);
  const helperPath=path.join(tempDir,'install-update.ps1');
  const appExe=installedExecutable();
  const userData=app.getPath('userData');
  const helper=`
$ErrorActionPreference = 'Stop'
$pidToWait = ${process.pid}
$installer = '${psQuote(installerPath)}'
$userData = '${psQuote(userData)}'
$backup = '${psQuote(backupRoot)}'
$appExe = '${psQuote(appExe)}'
Wait-Process -Id $pidToWait -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $backup | Out-Null
if (Test-Path -LiteralPath $userData) {
  Copy-Item -LiteralPath $userData -Destination (Join-Path $backup 'UserData') -Recurse -Force
}
$p = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
if ($p.ExitCode -ne 0) { exit $p.ExitCode }
Start-Process -FilePath $appExe
`;
  fs.writeFileSync(helperPath,helper,'utf8');

  const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',helperPath],{
    detached:true,stdio:'ignore',windowsHide:true
  });
  child.unref();
  setTimeout(()=>app.quit(),700);
  return {
    status:'installing',
    currentVersion,
    latestVersion:release.latestVersion,
    backupRoot,
    verification:signer.verification === 'authenticode'
      ? 'sha256+manifest+authenticode'
      : signer.verification === 'sha256+authenticode'
        ? 'sha256+manifest+authenticode'
        : 'sha256+manifest',
    signer:signer.subject || signer.thumbprint || null
  };
}

function payloadContainsSensitiveContext(payload={}) {
  if (payload?.sensitive_context === true || payload?.contains_sensitive_context === true) return true;
  let text = '';
  try {
    text = JSON.stringify({
      prompt:payload?.prompt || '',
      messages:payload?.messages || [],
      vehicle_info:payload?.vehicle_info || null,
      dtc_codes:payload?.dtc_codes || null
    });
  } catch {}
  return /━━━ USER KNOWLEDGE BASE ━━━/i.test(text)
    || /Medications:\s*(?!none)/i.test(text)
    || /Contacts:\s*(?!none)/i.test(text)
    || /Health:\s*Last BG=(?!none)/i.test(text)
    || /Finance:\s*Balance £/i.test(text)
    || /Memories:\s*(?!none)/i.test(text)
    || /"vehicle_info"\s*:\s*\{[^}]+\}/i.test(text);
}

function buildLocalDeviceUrl(baseValue, commandValue='') {
  const baseText = String(baseValue || '').trim();
  if (!baseText) throw new Error('LOCAL_DEVICE_URL_REQUIRED');
  const base = new URL(baseText.includes('://') ? baseText : `http://${baseText}`);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('LOCAL_DEVICE_PROTOCOL_BLOCKED');

  const host = base.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const family = require('node:net').isIP(host);
  const octets = host.split('.').map(Number);
  const privateIpv4 = family === 4 && (octets[0] === 127 || octets[0] === 10
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31));
  const privateIpv6 = family === 6 && (host === '::1'
    || /^f[cd]/.test(host) || /^fe[89ab]/.test(host));
  if (base.username || base.password) throw new Error('LOCAL_DEVICE_CREDENTIALS_BLOCKED');
  if (!(host === 'localhost' || privateIpv4 || privateIpv6)) {
    throw new Error('LOCAL_DEVICE_HOST_BLOCKED');
  }

  const command = String(commandValue || '');
  const combined = command
    ? base.toString().replace(/\/$/, '') + (command.startsWith('/') ? command : '/' + command)
    : base.toString();
  return new URL(combined).toString();
}

async function requestLocalDevice(request={}) {
  const targetUrl = buildLocalDeviceUrl(request.base, request.command);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(5000, Math.max(500, Number(request.timeout) || 3000)));
  try {
    const response = await fetch(targetUrl, {
      method:'GET',
      redirect:'error',
      signal:controller.signal,
      headers:{ 'User-Agent':'Jarvis-Local-Device' }
    });
    if (!response.ok) throw new Error(`LOCAL_DEVICE_HTTP_${response.status}`);
    const text = await response.text();
    let data = text;
    try { data = JSON.parse(text); } catch {}
    return { success:true, url:targetUrl, data };
  } finally {
    clearTimeout(timeout);
  }
}

function functionPolicyAction(name, payload={}) {
  const functionName = String(name || 'unknown');
  // Normal AI chat and user-selected AI attachments do not interrupt every request
  // with a policy dialog. Destructive/system operations keep their own policy gates.
  return {
    type: functionName === 'deleteAccount' ? 'account_delete' : `function:${functionName}`,
    target:functionName,
    authorised:localOwnerAuthorised(),
    transmitsSensitiveData:false
  };
}

function isPotentiallyMutatingObdCommand(command='') {
  const clean = String(command).toUpperCase().replace(/[^0-9A-F]/g, '');
  return clean === '04'
    || clean.startsWith('11')
    || clean.startsWith('14')
    || clean.startsWith('2E')
    || clean.startsWith('2F')
    || clean.startsWith('31')
    || clean.startsWith('34')
    || clean.startsWith('36')
    || clean.startsWith('37');
}

async function enforcePolicy(action={}, options={}) {
  if (!policy) throw new Error('JARVIS_POLICY_NOT_READY');
  const securedAction = { ...action, authorised:localOwnerAuthorised() };
  if (options.overrideToken && policy.consumeOverride(options.overrideToken, securedAction)) {
    policy.audit('policy_override_consumed_for_operation', { action:securedAction });
    return { ok:true, status:'allow', ruleIds:['RULE-11','RULE-15'], reason:'OWNER_OVERRIDE_CONSUMED' };
  }
  const decision = policy.evaluate(securedAction);
  if (decision.status === 'block') {
    const error = new Error(`JARVIS_POLICY_BLOCKED:${decision.reason}`);
    error.code = 'JARVIS_POLICY_BLOCKED';
    error.policyDecision = decision;
    throw error;
  }
  if (decision.status === 'confirm') {
    if (options.interactive === false) {
      const error = new Error('JARVIS_POLICY_CONFIRMATION_REQUIRED');
      error.code = 'JARVIS_POLICY_CONFIRMATION_REQUIRED';
      throw error;
    }
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type:'warning',
      buttons:['Mégse','Engedélyezem'],
      defaultId:0,
      cancelId:0,
      noLink:true,
      title:'Jarvis biztonsági megerősítés',
      message:options.message || 'Ez a művelet kiemelt jogosultságot vagy érzékeny adatkezelést igényel.',
      detail:`${decision.reason}\n\nMűvelet: ${action.type || 'unknown'}\nCél: ${action.target || '-'}`
    });
    if (confirmation.response !== 1) {
      policy.audit('policy_confirmation_denied', { action, decision });
      const error = new Error('JARVIS_POLICY_USER_DENIED');
      error.code = 'JARVIS_POLICY_USER_DENIED';
      throw error;
    }
    policy.audit('policy_confirmation_allowed', { action, decision });
  }
  return decision;
}

async function guarded(action, operation, options={}) {
  await enforcePolicy(action, options);
  return operation();
}

async function runSystemCheck() {
  const checks = [];
  const add = (id, label, ok, detail, severity = 'normal') => checks.push({ id, label, ok:Boolean(ok), detail:String(detail || ''), severity });

  try {
    const stats = database.healthCheck();
    add('database', 'SQLite adatbázis', stats.integrity === 'ok', stats.entityCount + ' rekord · integrity: ' + stats.integrity);
  } catch (error) {
    add('database', 'SQLite adatbázis', false, error?.message || error, 'critical');
  }

  try {
    const dir = path.join(app.getPath('documents'), 'Jarvis Backups');
    fs.mkdirSync(dir, { recursive:true });
    fs.accessSync(dir, fs.constants.W_OK);
    add('backup', 'Backup mappa', true, dir);
  } catch (error) {
    add('backup', 'Backup mappa', false, error?.message || error, 'critical');
  }

  add('safe-storage', 'Windows titkosított kulcstár', safeStorage.isEncryptionAvailable(), safeStorage.isEncryptionAvailable() ? 'DPAPI/safeStorage elérhető' : 'safeStorage nem elérhető', safeStorage.isEncryptionAvailable() ? 'normal' : 'warning');

  try {
    const ports = await obdBridge.listSerialPorts();
    const recommended = ports.filter((port) => port.score > 0);
    add('obd', 'OBD / COM eszközök', true, ports.length + ' port · ' + recommended.length + ' OBD-gyanús');
  } catch (error) {
    add('obd', 'OBD / COM eszközök', false, error?.message || error, 'warning');
  }

  try {
    const raw = readJson(settingsPath(), {});
    const decryptedKey = unprotectSecret(raw.openRouterKey);
    if (!decryptedKey) {
      add('ai', 'AI / OpenRouter', false, 'Nincs használható OpenRouter API-kulcs', 'warning');
    } else {
      const aiStatus = await testOpenRouterConnection();
      add('ai', 'AI / OpenRouter', aiStatus.success === true, aiStatus.success ? `Kapcsolat rendben · ${aiStatus.modelCount} modell` : 'OpenRouter kapcsolat sikertelen', aiStatus.success ? 'normal' : 'warning');
    }
  } catch (error) {
    add('ai', 'AI konfiguráció', false, error?.message || error, 'warning');
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(UPDATE_API, { headers:{'User-Agent':'Jarvis-System-Check'}, signal:controller.signal });
    clearTimeout(timeout);
    add('network', 'Internet / frissítési csatorna', response.ok, response.ok ? 'GitHub release csatorna elérhető' : 'HTTP ' + response.status, response.ok ? 'normal' : 'warning');
  } catch (error) {
    add('network', 'Internet / frissítési csatorna', false, error?.name === 'AbortError' ? 'Időtúllépés' : (error?.message || error), 'warning');
  }

  if (process.platform === 'win32') {
    try {
      const ps = "$s=Get-AuthenticodeSignature -LiteralPath '" + psQuote(process.execPath) + "'; [pscustomobject]@{Status=[string]$s.Status;Signer=if($s.SignerCertificate){$s.SignerCertificate.Subject}else{''}} | ConvertTo-Json -Compress";
      const { stdout } = await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',ps],{timeout:5000,windowsHide:true});
      const signing = JSON.parse(stdout.trim());
      const signed = signing.Status === 'Valid';
      add('signing', 'Digitális aláírás', signed, signed ? ('Érvényes · ' + signing.Signer) : ('Állapot: ' + signing.Status), signed ? 'normal' : 'warning');
    } catch (error) {
      add('signing', 'Digitális aláírás', false, error?.message || error, 'warning');
    }
  }

  const context = await getSystemContext();
  const freeGb = Number(context.freeMemoryBytes || 0) / 1024 / 1024 / 1024;
  add('memory', 'Szabad memória', freeGb >= 1, freeGb.toFixed(1) + ' GB szabad RAM', freeGb >= 1 ? 'normal' : 'warning');

  const report = {
    id:crypto.randomUUID(),
    checkedAt:new Date().toISOString(),
    appVersion:app.getVersion(),
    checks,
    ok:checks.every((check) => check.ok || check.severity !== 'critical')
  };
  latestSystemReport = report;
  return report;
}

function buildRepairPlan(report) {
  if (!report?.id || !Array.isArray(report?.checks)) throw new Error('JARVIS_REPAIR_REPORT_INVALID');
  const failed = report.checks.filter((check) => !check.ok);
  const repairs = [];
  for (const check of failed) {
    if (check.id === 'backup') repairs.push({ id:'repair-backup-directory', checkId:check.id, title:'Backup mappa helyreállítása', description:'Újralétrehozza a Jarvis Backups mappát és ellenőrzi az írhatóságát.', risk:'low', automatic:true });
    else if (check.id === 'network') repairs.push({ id:'repair-network-cache', checkId:check.id, title:'Hálózati gyorsítótár frissítése', description:'Törli az Electron hálózati gyorsítótárát, majd újraellenőrzi a GitHub frissítési csatornát.', risk:'low', automatic:true });
    else if (check.id === 'obd') repairs.push({ id:'repair-obd-reset', checkId:check.id, title:'OBD kapcsolat újraindítása', description:'Biztonságosan bontja az aktuális OBD kapcsolatot, hogy tiszta állapotból lehessen újracsatlakozni.', risk:'low', automatic:true });
    else if (check.id === 'ai' && /kapcsolat/i.test(String(check.detail || ''))) repairs.push({ id:'repair-ai-session', checkId:check.id, title:'AI kapcsolat helyreállítása', description:'Törli a hálózati gyorsítótárat és újraellenőrzi az OpenRouter kapcsolatot. Az API-kulcsot nem módosítja.', risk:'low', automatic:true });
    else if (check.id === 'ai') repairs.push({ id:'manual-ai-key', checkId:check.id, title:'OpenRouter API-kulcs beállítása szükséges', description:check.detail, risk:'low', automatic:false });
    else repairs.push({ id:'manual-' + check.id, checkId:check.id, title:check.label + ' – kézi beavatkozás szükséges', description:check.detail, risk:check.severity === 'critical' ? 'high' : 'medium', automatic:false });
  }
  return { reportId:report.id, generatedAt:new Date().toISOString(), repairs };
}

async function runApprovedRepair(repairId, reportId) {
  if (!localOwnerAuthorised()) throw new Error('JARVIS_REPAIR_UNAUTHORISED');
  if (!latestSystemReport?.id || String(reportId || '') !== String(latestSystemReport.id)) {
    throw new Error('JARVIS_REPAIR_REPORT_STALE');
  }
  const currentPlan = buildRepairPlan(latestSystemReport);
  const approvedRepair = currentPlan.repairs.find((repair) => repair.id === repairId && repair.automatic);
  if (!approvedRepair) throw new Error('JARVIS_REPAIR_NOT_CURRENT');
  switch (repairId) {
    case 'repair-backup-directory': {
      const dir = path.join(app.getPath('documents'), 'Jarvis Backups');
      fs.mkdirSync(dir, { recursive:true });
      fs.accessSync(dir, fs.constants.W_OK);
      break;
    }
    case 'repair-network-cache':
      await session.defaultSession.clearCache();
      break;
    case 'repair-obd-reset':
      await obdBridge.disconnect().catch(() => {});
      break;
    case 'repair-ai-session':
      await session.defaultSession.clearCache();
      await testOpenRouterConnection();
      break;
    default:
      throw new Error('JARVIS_REPAIR_NOT_ALLOWLISTED');
  }
  const report = await runSystemCheck();
  const plan = buildRepairPlan(report);
  selfRepairLearning?.recordVerified?.({
    title:'Beépített javítás: ' + repairId,
    repairId,
    evidence:'A beépített javítás végrehajtása után a rendszerellenőrzés lefutott.',
    validation:report.ok ? 'Rendszerellenőrzés: OK' : 'Rendszerellenőrzés: figyelmeztetésekkel',
    success:true
  });
  return { success:true, repairId, report, plan };
}

function configureObdBluetoothChooser(win) {
  let pendingCallback = null;
  let cancelTimer = null;
  const knownObdName = /(OBD|ELM|OBDLINK|VGATE|V-LINK|VLINK|ICAR|VEEPEAK|KONNWEI|STN|CX)/i;

  win.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    pendingCallback = callback;
    const preferred = deviceList.find((device) => knownObdName.test(device.deviceName || ''));
    if (preferred) {
      clearTimeout(cancelTimer);
      pendingCallback = null;
      callback(preferred.deviceId);
      return;
    }

    clearTimeout(cancelTimer);
    cancelTimer = setTimeout(() => {
      if (pendingCallback === callback) {
        pendingCallback = null;
        callback('');
      }
    }, 12000);
  });

  win.on('closed', () => {
    clearTimeout(cancelTimer);
    if (pendingCallback) {
      try { pendingCallback(''); } catch {}
      pendingCallback = null;
    }
  });
}

function isTrustedRendererNavigation(targetUrl='') {
  try {
    const parsed = new URL(String(targetUrl || ''));
    if (isDev) {
      return parsed.protocol === 'http:'
        && parsed.hostname === '127.0.0.1'
        && parsed.port === '5173';
    }
    if (parsed.protocol !== 'file:') return false;
    const requested = path.resolve(fileURLToPath(parsed));
    const entry = path.resolve(path.join(__dirname,'..','dist','index.html'));
    return requested === entry;
  } catch {
    return false;
  }
}

function openExternalUrl(targetUrl='') {
  try {
    const parsed = new URL(String(targetUrl || ''));
    const allowedProtocols = new Set(['http:','https:','mailto:','tel:','sms:']);
    if (!allowedProtocols.has(parsed.protocol)) return;
    void shell.openExternal(parsed.toString()).catch((error)=>{
      recordCrash('external-url-open-failed', {
        kind:'external-url',
        message:String(error?.message || error),
        href:parsed.protocol
      });
    });
  } catch {}
}

function lockRendererNavigation(win) {
  win.webContents.on('will-navigate',(event,targetUrl)=>{
    if (isTrustedRendererNavigation(targetUrl)) return;
    event.preventDefault();
    openExternalUrl(targetUrl);
  });
  win.webContents.setWindowOpenHandler(({url})=>{
    openExternalUrl(url);
    return { action:'deny' };
  });
}

function configureMediaPermissions(win) {
  const ses = win.webContents.session;
  const trustedRequester = (webContents, requestingUrl='') => {
    if (!webContents || webContents !== win.webContents) return false;
    return isTrustedRendererNavigation(requestingUrl || webContents.getURL());
  };

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details={}) => {
    const requestingUrl = details.requestingUrl || webContents?.getURL?.() || requestingOrigin || '';
    const origin = String(requestingOrigin || '');
    if (origin && origin !== 'null' && origin !== 'file://' && !isTrustedRendererNavigation(origin)) return false;
    // Other Electron permissions must not be globally approved for any
    // untrusted window or origin simply because they are not microphone access.
    if (!trustedRequester(webContents, requestingUrl)) return false;
    if (permission !== 'media') return true;
    const mediaType = details.mediaType || 'unknown';
    return mediaType === 'audio' || mediaType === 'unknown';
  });

  ses.setPermissionRequestHandler((webContents, permission, callback, details={}) => {
    const requestingUrl = details.requestingUrl || webContents?.getURL?.() || details.securityOrigin || '';
    const origin = String(details.securityOrigin || '');
    if ((origin && origin !== 'null' && origin !== 'file://' && !isTrustedRendererNavigation(origin))
      || !trustedRequester(webContents, requestingUrl)) {
      callback(false);
      return;
    }
    if (permission !== 'media') {
      callback(true);
      return;
    }
    const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
    const requestsVideo = mediaTypes.includes('video');
    const requestsAudio = mediaTypes.length === 0 || mediaTypes.includes('audio');
    callback(requestsAudio && !requestsVideo);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width:1400,
    height:900,
    minWidth:1000,
    minHeight:700,
    icon:resourcePath('build','icon.ico'),
    title:'Jarvis',
    ...(process.platform === 'win32' ? {
      titleBarStyle:'hidden',
      titleBarOverlay:{ color:'#020b18', symbolColor:'#c7e9ff', height:30 }
    } : {}),
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      contextIsolation:true,
      nodeIntegration:false,
      sandbox:true,
      webSecurity:true
    }
  });
  mainWindow.removeMenu();
  lockRendererNavigation(mainWindow);
  configureMediaPermissions(mainWindow);
  configureObdBluetoothChooser(mainWindow);
  registerCrashWatchdog(mainWindow);
  if (isDev) mainWindow.loadURL('http://127.0.0.1:5173');
  else mainWindow.loadFile(path.join(__dirname,'..','dist','index.html'));
}

app.whenReady().then(async () => {
  if (adminHelperConfig) {
    await startAdminHelper(adminHelperConfig,{ onClose:() => app.quit() });
    return;
  }

  if (handOffToManualRuntimeIfReady()) return;

  seedInitialSettings();
  purgeInsecureLegacySecrets();
  obdBridge = new NativeObdBridge();
  database = new LocalDatabase(path.join(app.getPath('userData'), 'data', 'jarvis.sqlite3'));
  backupManager = new BackupManager({ app, dialog, database, getSettings:getSettingsInternal, saveSettings:saveSettingsInternal });
  selfRepairLearning = new SelfRepairLearning(path.join(app.getPath('userData'),'self-repair-learning.json'));
  adminDiagnosticsManager = new AdminDiagnosticsManager({
    execPath:process.execPath,
    appPath:app.getAppPath(),
    isPackaged:app.isPackaged
  });
  policy = new PolicyEngine({
    rulesPath:resourcePath('security','core-rules.json'),
    signaturePath:resourcePath('security','core-rules.sig'),
    publicKeyPath:resourcePath('security','core-rules-public.pem'),
    auditPath:path.join(app.getPath('userData'),'audit','policy.jsonl'),
    pinVerifierPath:path.join(app.getPath('userData'),'security','owner-pin.json')
  });

  ipcMain.handle('jarvis:policy:rules', () => policy.getPublicRules());
  ipcMain.handle('jarvis:policy:evaluate', (_e, action={}) => policy.evaluate({ ...action, authorised:localOwnerAuthorised() }));
  ipcMain.handle('jarvis:policy:override', (_e, req={}) => policy.requestOverride({
    ...req,
    action:{ ...(req.action || {}), authorised:localOwnerAuthorised() }
  }));
  ipcMain.handle('jarvis:policy:pin:status', () => policy.getPinStatus());
  ipcMain.handle('jarvis:policy:pin:set', (_e, req={}) => {
    if (!localOwnerAuthorised()) throw new Error('JARVIS_POLICY_UNAUTHORISED');
    const status = policy.getPinStatus();
    if (status.configured) {
      const current = policy.verifyPin(req.currentPin);
      if (!current.ok) throw new Error(current.reason || 'INVALID_OWNER_PIN');
    }
    return policy.setOwnerPin(req.newPin);
  });
  ipcMain.handle('jarvis:system:context', () => getSystemContext());
  ipcMain.handle('jarvis:crash:recent', (_e, limit=20) => readRecentCrashes(limit));
  ipcMain.handle('jarvis:crash:report', (_e, report={}) => recordCrash('renderer-js-error',{
    kind:String(report.kind || 'runtime').slice(0,80),
    message:String(report.message || '').slice(0,4000),
    stack:String(report.stack || '').slice(0,12000),
    href:String(report.href || '').slice(0,1200)
  }));
  ipcMain.handle('jarvis:admin:status', () => adminDiagnosticsManager?.status?.() || {active:false,expiresAt:null});
  ipcMain.handle('jarvis:admin:start', async () => {
    await requireOwnerPresence({
      title:'Rendszergazdai diagnosztika',
      message:'Engedélyezed a Jarvis rendszergazdai diagnosztikai munkamenetét?',
      detail:'A következő lépésben a Windows UAC is külön engedélyt kér. A munkamenet időkorlátos és csak az engedélyezett diagnosztikai műveleteket használhatja.'
    });
    return adminDiagnosticsManager.start();
  });
  ipcMain.handle('jarvis:admin:snapshot', async () => {
    if (!adminDiagnosticsManager?.isActive?.()) throw new Error('ADMIN_SESSION_NOT_ACTIVE');
    return adminDiagnosticsManager.snapshot();
  });
  ipcMain.handle('jarvis:admin:request', async (_e, request={}) => {
    if (!adminDiagnosticsManager?.isActive?.()) throw new Error('ADMIN_SESSION_NOT_ACTIVE');
    const operation = String(request.operation || '');
    const allowed = new Set(['listDirectory','readTextFile','registryQuery']);
    if (!allowed.has(operation)) throw new Error('ADMIN_OPERATION_NOT_ALLOWLISTED');
    return adminDiagnosticsManager.request(operation, request.payload || {});
  });
  ipcMain.handle('jarvis:admin:stop', () => adminDiagnosticsManager?.stop?.() || {active:false,expiresAt:null});

  ipcMain.handle('jarvis:settings:get', () => getSettingsInternal());
  ipcMain.handle('jarvis:theme:set', (_e, theme) => {
    const resolved = theme === 'light' ? 'light' : 'dark';
    nativeTheme.themeSource = resolved;
    if (mainWindow && process.platform === 'win32') {
      try {
        mainWindow.setTitleBarOverlay({
          color: resolved === 'light' ? '#f8fcff' : '#020b18',
          symbolColor: resolved === 'light' ? '#12314d' : '#c7e9ff',
          height:30
        });
      } catch {}
    }
    return { success:true, theme:resolved };
  });
  ipcMain.handle('jarvis:settings:save', (_e, patch) => guarded(
    { type:'local_settings_write', target:settingsPath() },
    () => saveSettingsInternal(patch)
  ));
  ipcMain.handle('jarvis:function:invoke', (_e, name, payload={}) => guarded(
    functionPolicyAction(name, payload),
    () => invokeJarvisFunction(name, payload),
    {
      message:'Jarvis külső szolgáltatásnak érzékeny adatot küldene, vagy kiemelt műveletet hajtana végre.',
      overrideToken:payload?.__ownerOverrideToken || null
    }
  ));
  ipcMain.handle('jarvis:ai:test-connection', (_event, payload={}) => guarded(
    { type:'openrouter_connection_test', target:'openrouter.ai' },
    async () => {
      const candidateApiKey = String(payload?.apiKey || '').trim();
      const result = await testOpenRouterConnection(candidateApiKey);
      if (candidateApiKey) await saveSettingsInternal({ openRouterApiKey:candidateApiKey });
      return result;
    }
  ));
  ipcMain.handle('jarvis:ai:list-models', async () => {
    const raw=readJson(settingsPath(),{}); const key=unprotectSecret(raw.openRouterKey);
    if (!key) return [];
    return withNetworkTimeout(15000, 'OPENROUTER_MODELS', async (signal) => {
      const res=await fetch('https://openrouter.ai/api/v1/models',{signal,headers:{Authorization:`Bearer ${key}`}});
      if(!res.ok) throw new Error(`OPENROUTER_MODELS_${res.status}`);
      const json=await res.json();
      return (json.data||[]).map(m=>({id:m.id,name:m.name||m.id,context_length:m.context_length||null,pricing:m.pricing||null}));
    });
  });
  ipcMain.handle('jarvis:ai:list-speech-models', () => listOpenRouterSpeechModels());
  ipcMain.handle('jarvis:file:select', async (_e, options={}) => dialog.showOpenDialog(mainWindow,{properties:['openFile', ...(options.multiple?['multiSelections']:[]) ]}));
  ipcMain.handle('jarvis:update:one-click', () => guarded(
    { type:'system_file_write', target:process.execPath },
    () => oneClickUpdate(),
    { message:'Jarvis új telepítőt fog letölteni, ellenőrizni és rendszerszinten futtatni.' }
  ));
  ipcMain.handle('jarvis:device:request', (_e, request={}) => {
    const target = buildLocalDeviceUrl(request.base, request.command);
    return guarded(
      { type:request.readOnly === true ? 'device_status' : 'device_control', target },
      () => requestLocalDevice(request)
    );
  });
  ipcMain.handle('jarvis:obd:list-ports', () => guarded(
    { type:'obd_list', target:'local-device' },
    () => obdBridge.listSerialPorts()
  ));
  ipcMain.handle('jarvis:obd:connect', (_e, options) => guarded(
    { type:'obd_connect', target:String(options?.path || options?.address || 'local-device') },
    () => obdBridge.connect(options || {})
  ));
  ipcMain.handle('jarvis:obd:send', (_e, request={}) => guarded(
    {
      type:isPotentiallyMutatingObdCommand(request.command) ? 'obd_write' : 'obd_read',
      target:String(request.command || '')
    },
    () => obdBridge.sendCommand(request?.command, request?.timeout),
    { message:'Ez az OBD parancs módosíthatja a jármű vezérlőegységének állapotát.' }
  ));
  ipcMain.handle('jarvis:obd:status', () => obdBridge.status());
  ipcMain.handle('jarvis:obd:disconnect', () => obdBridge.disconnect());
  ipcMain.handle('jarvis:data:filter', (_e, req={}) => database.filter(req.entity, req.query, req.sort, req.limit));
  ipcMain.handle('jarvis:data:search', (_e, req={}) => database.search(req.entity, req.query, req.text, req.limit));
  ipcMain.handle('jarvis:data:create', (_e, req={}) => guarded(
    { type:'local_data_write', target:String(req.entity || '') },
    () => database.create(req.entity, req.data)
  ));
  ipcMain.handle('jarvis:data:update', (_e, req={}) => guarded(
    { type:'local_data_write', target:`${String(req.entity || '')}/${String(req.id || '')}` },
    () => database.update(req.entity, req.id, req.patch)
  ));
  ipcMain.handle('jarvis:data:delete', (_e, req={}) => guarded(
    { type:'local_data_delete', target:`${String(req.entity || '')}/${String(req.id || '')}` },
    () => database.delete(req.entity, req.id)
  ));
  ipcMain.handle('jarvis:data:import-legacy', (_e, snapshot={}) => guarded(
    { type:'local_data_import', target:'legacy-local-storage' },
    () => database.importLegacy(snapshot)
  ));
  ipcMain.handle('jarvis:data:stats', () => database.stats());
  ipcMain.handle('jarvis:data:user:get', () => database.getUser());
  ipcMain.handle('jarvis:data:user:update', (_e, patch={}) => guarded(
    { type:'local_data_write', target:'local-owner-profile' },
    () => database.updateUser(patch)
  ));
  ipcMain.handle('jarvis:backup:create', (_e, req={}) => guarded(
    { type:'backup_create', target:'Jarvis Backups' },
    () => backupManager.create(req.passphrase)
  ));
  ipcMain.handle('jarvis:backup:restore', (_e, req={}) => guarded(
    { type:'backup_restore', target:'local-database' },
    () => backupManager.restore(req.passphrase)
  ));
  ipcMain.handle('jarvis:system:check', () => runSystemCheck());
  ipcMain.handle('jarvis:repair:plan', (_e, report={}) => {
    if (!latestSystemReport?.id || report?.id !== latestSystemReport.id) throw new Error('JARVIS_REPAIR_REPORT_STALE');
    return buildRepairPlan(latestSystemReport);
  });
  ipcMain.handle('jarvis:self-repair:manual:pending', () => {
    if (!localOwnerAuthorised()) throw new Error('MANUAL_REPAIR_UNAUTHORISED');
    return mostRecentPendingManualRepair();
  });
  ipcMain.handle('jarvis:self-repair:github:status', async () => {
    if (!localOwnerAuthorised()) throw new Error('MANUAL_REPAIR_UNAUTHORISED');
    return getGitHubSelfRepairStatus();
  });
  ipcMain.handle('jarvis:self-repair:github:connect', async (_e, request={}) => {
    if (!localOwnerAuthorised()) throw new Error('MANUAL_REPAIR_UNAUTHORISED');
    return connectGitHubSelfRepair(request.token);
  });
  ipcMain.handle('jarvis:self-repair:github:disconnect', () => {
    if (!localOwnerAuthorised()) throw new Error('MANUAL_REPAIR_UNAUTHORISED');
    return disconnectGitHubSelfRepair();
  });
  ipcMain.handle('jarvis:self-repair:github:refresh', async () => {
    if (!localOwnerAuthorised()) throw new Error('MANUAL_REPAIR_UNAUTHORISED');
    return getGitHubSelfRepairStatus();
  });
  ipcMain.handle('jarvis:self-repair:github:abandon', async () => {
    if (!localOwnerAuthorised()) throw new Error('MANUAL_REPAIR_UNAUTHORISED');
    return abandonGitHubSelfRepair();
  });
  ipcMain.handle('jarvis:self-repair:github:merge', async () => {
    if (!localOwnerAuthorised()) throw new Error('MANUAL_REPAIR_UNAUTHORISED');
    return mergeGitHubSelfRepair();
  });
  ipcMain.handle('jarvis:self-repair:github:publish', async (_e, request={}) => {
    if (!localOwnerAuthorised()) throw new Error('MANUAL_REPAIR_UNAUTHORISED');
    return publishGitHubSelfRepairRelease(request.allowUnsigned === true);
  });
  ipcMain.handle('jarvis:self-repair:manual:apply', async (_e, request={}) => {
    if (!localOwnerAuthorised()) throw new Error('MANUAL_REPAIR_UNAUTHORISED');
    if (manualRepairApplyInFlight) throw new Error('MANUAL_REPAIR_ALREADY_IN_PROGRESS');
    manualRepairApplyInFlight = true;
    try {
      const hash=String(request.hash || '').trim().toLowerCase();
      const entry=loadPersistedManualRepairPlan(hash);
      if (!entry) throw new Error('MANUAL_REPAIR_PLAN_NOT_FOUND');
      manualRepairPlans.set(hash,entry);
      if (Date.now()-entry.createdAt > 60*60*1000) {
        manualRepairPlans.delete(hash);
        removePersistedManualRepairPlan(hash);
        throw new Error('MANUAL_REPAIR_PLAN_EXPIRED');
      }
      const approvedPlan={...entry.plan};
      delete approvedPlan.hash;
      if (developerRepair.proposalHash(approvedPlan)!==hash) {
        manualRepairPlans.delete(hash);
        removePersistedManualRepairPlan(hash);
        throw new Error('MANUAL_REPAIR_PLAN_MUTATED');
      }

      // "Elfogadom / Accept" approves only this exact hashed patch. The patch is
      // first exercised in the isolated Self-Repair workspace. The installed
      // Jarvis runtime is not replaced by that staging build. Only the exact
      // locally validated file bytes may be sent to a dedicated GitHub repair
      // branch; merge and release remain separate owner actions.
      if (!loadPersistedManualRepairPlan(hash)) throw new Error('MANUAL_REPAIR_PLAN_MUTATED');
      getGitHubSelfRepairClient();
      const activeGitHubRepair = readGitHubRepairState();
      if (activeGitHubRepair && activeGitHubRepair.phase !== 'released') {
        throw new Error('GITHUB_REPAIR_ALREADY_ACTIVE');
      }

      const expectedBaseFiles=developerRepair.readOwnerPlanFiles(entry.workspace,entry.plan);
      const workspaceFingerprintBefore=selfRepairSourceFingerprint(entry.workspace);
      const backup=developerRepair.snapshotOwner(entry.workspace,entry.plan,developerBackupRoot());
      const previousRuntime = activation.snapshotRuntime(entry.workspace, manualRuntimeStatePath(), backup);
      selfRepairToolchainPaths();
      fs.rmSync(manualRuntimeStatePath(),{force:true});
      if (fs.existsSync(manualRuntimeStatePath())) throw new Error('MANUAL_REPAIR_DISABLE_RUNTIME_FAILED');

      let workspaceRestored=false;
      let localValidationCompleted=false;
      try {
        developerRepair.applyOwner(entry.workspace,entry.plan);
        const validation=await validateDirectOwnerRepair(entry.workspace,entry.plan);
        if (!validation.ok) {
          developerRepair.rollbackOwner(entry.workspace,backup);
          activation.restoreRuntime(entry.workspace,manualRuntimeStatePath(),previousRuntime);
          workspaceRestored=true;
          if (selfRepairSourceFingerprint(entry.workspace) !== workspaceFingerprintBefore) {
            try { fs.rmSync(entry.workspace,{recursive:true,force:true}); } catch {}
            throw new Error('MANUAL_REPAIR_STAGING_INTEGRITY_FAILED');
          }
          manualRepairPlans.delete(hash);
          removePersistedManualRepairPlan(hash);
          return {success:false,status:'ROLLED_BACK',hash,backup,validation};
        }

        const runtime = await ensureManualRuntimeBuilt(entry.workspace);
        const stagedFiles=developerRepair.readOwnerPlanFiles(entry.workspace,entry.plan);
        if (stagedFiles.some((item)=>typeof item.content !== 'string')) {
          throw new Error('GITHUB_REPAIR_STAGED_FILE_MISSING');
        }
        const fullValidation = {
          ok:true,
          results:[...(validation.results || []),...(runtime.checks || [])]
        };
        localValidationCompleted=true;

        // Never leave the locally repaired staging runtime active while GitHub
        // independently verifies the patch. Restore both source and activation
        // state before any network mutation.
        fs.rmSync(manualRuntimeStatePath(),{force:true});
        developerRepair.rollbackOwner(entry.workspace,backup);
        activation.restoreRuntime(entry.workspace,manualRuntimeStatePath(),previousRuntime);
        workspaceRestored=true;
        if (selfRepairSourceFingerprint(entry.workspace) !== workspaceFingerprintBefore) {
          try { fs.rmSync(entry.workspace,{recursive:true,force:true}); } catch {}
          throw new Error('MANUAL_REPAIR_STAGING_INTEGRITY_FAILED');
        }

        const client=getGitHubSelfRepairClient();
        const published=await client.createRepairPullRequest({
          hash,
          goal:entry.plan.goal,
          rationale:entry.plan.rationale,
          risk:entry.plan.risk,
          files:stagedFiles,
          expectedBaseFiles,
          validation:fullValidation.results,
          installedVersion:String(app.getVersion?.() || '')
        });
        if (!Number.isInteger(published?.prNumber) || !published?.headSha || !published?.version) {
          throw new Error('GITHUB_REPAIR_PUBLISH_RESULT_INVALID');
        }

        const githubState={
          schema:1,
          phase:'pull-request',
          repairHash:hash,
          goal:entry.plan.goal || 'Jarvis Self-Repair',
          risk:entry.plan.risk || 'medium',
          files:entry.plan.patches.map((patch)=>patch.file),
          repo:published.repo || githubSelfRepair.DEFAULT_REPO,
          branch:published.branch,
          baseSha:published.baseSha,
          headSha:published.headSha,
          version:published.version,
          prNumber:published.prNumber,
          prUrl:published.prUrl || null,
          createdAt:Date.now(),
          updatedAt:Date.now(),
          localValidation:fullValidation
        };
        try {
          writeGitHubRepairState(githubState);
        } catch (stateError) {
          throw new Error('GITHUB_REPAIR_STATE_PERSIST_FAILED: ' + String(stateError?.message || stateError));
        }

        try {
          selfRepairLearning?.recordVerified?.({
            title:entry.plan.goal || 'Kézi Self-Repair',
            repairId:hash,
            files:entry.plan.patches.map((patch)=>patch.file),
            evidence:entry.plan.rationale || entry.plan.goal || '',
            validation:fullValidation.results
              .map((item)=>`${item.cmd}: ${item.ok ? 'OK' : 'FAIL'}`).join('; '),
            success:true
          });
        } catch (learningError) {
          console.warn('Self-Repair learning could not be saved:', learningError);
        }

        manualRepairPlans.delete(hash);
        removePersistedManualRepairPlan(hash);
        return {
          success:true,
          status:'GITHUB_PR_OPENED',
          hash,
          backup,
          files:entry.plan.patches.map((patch)=>patch.file),
          validation:fullValidation,
          github:githubState,
          runtime:{
            version:runtime.version,
            builtAt:runtime.builtAt,
            restartScheduled:false,
            stagingOnly:true
          }
        };
      } catch (error) {
        try { fs.rmSync(manualRuntimeStatePath(),{force:true}); } catch {}
        let rollbackFailure=null;
        if (!workspaceRestored) {
          try {
            developerRepair.rollbackOwner(entry.workspace,backup);
            activation.restoreRuntime(entry.workspace,manualRuntimeStatePath(),previousRuntime);
            workspaceRestored=true;
          } catch (rollbackError) {
            rollbackFailure=rollbackError;
          }
        }
        const isGitHubError = /^GITHUB_/.test(String(error?.message || error || ''));
        if (!isGitHubError || !localValidationCompleted) {
          manualRepairPlans.delete(hash);
          removePersistedManualRepairPlan(hash);
        }
        if (rollbackFailure) {
          throw new Error(
            'MANUAL_REPAIR_ROLLBACK_FAILED: ' + String(rollbackFailure?.message || rollbackFailure)
            + ' (original: ' + String(error?.message || error) + ')'
          );
        }
        throw error;
      }
    } finally {
      manualRepairApplyInFlight = false;
    }
  });

  ipcMain.handle('jarvis:repair:apply', (_e, request={}) => guarded(
    { type:'system_repair', target:String(request.repairId || '') },
    () => runApprovedRepair(request.repairId, request.reportId),
    { message:'Jarvis egy helyi javítást készül végrehajtani. A művelet csak a jóváhagyott, beépített javítási listából futhat.' }
  ));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

process.on('uncaughtExceptionMonitor',(error,origin)=>{
  recordCrash('main-uncaught-exception',{message:String(error?.message || error),stack:String(error?.stack || '').slice(0,12000),origin});
});
app.on('child-process-gone',(_event,details={})=>{
  recordCrash('child-process-gone',{
    type:details.type || 'unknown',
    reason:details.reason || 'unknown',
    exitCode:details.exitCode ?? null,
    serviceName:details.serviceName || null,
    name:details.name || null
  });
});

app.on('before-quit', () => {
  obdBridge?.disconnect?.().catch(() => {});
  adminDiagnosticsManager?.stop?.().catch?.(() => {});
  database?.close?.();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
