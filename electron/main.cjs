'use strict';

const { app, BrowserWindow, ipcMain, dialog, safeStorage, session, nativeTheme, shell } = require('electron');
const path = require('path');
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
const { SelfRepairLearning } = require('./self-repair-learning.cjs');
const { parseHelperArgs, startAdminHelper, AdminDiagnosticsManager } = require('./admin-diagnostics.cjs');
const {
  analyzeUploadedFiles,
  analyzeProjectDeep,
  analyzeProjectSpecialists,
} = require('./analysis/file-analyzer.cjs');

const isDev = !app.isPackaged;
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
const developerPlans = new Map();
let latestSystemReport = null;
let autonomousRepairStopRequested = false;

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

function autonomousSourceRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'self-development-source')
    : path.join(__dirname, '..');
}

function selfRepairToolchainPaths() {
  if (!app.isPackaged) return null;
  const root = path.join(process.resourcesPath, 'self-repair-toolchain');
  const node = path.join(root, process.platform === 'win32' ? 'node.exe' : 'node');
  const npmCli = path.join(root, 'npm', 'bin', 'npm-cli.js');
  if (!fs.existsSync(node) || !fs.existsSync(npmCli)) {
    throw new Error('AUTONOMOUS_REPAIR_TOOLCHAIN_MISSING');
  }
  return { root, node, npmCli };
}

function withSelfRepairToolchainEnv(options={}, toolchain=selfRepairToolchainPaths()) {
  const env = { ...process.env, ...(options.env || {}) };
  const existingPath = env.PATH || env.Path || '';
  const toolchainPath = [toolchain.root, existingPath].filter(Boolean).join(path.delimiter);
  return {
    ...options,
    env:{ ...env, PATH:toolchainPath, Path:toolchainPath }
  };
}

async function runToolchainNode(args, options={}) {
  if (!app.isPackaged) {
    return execFileAsync(process.platform === 'win32' ? 'node.exe' : 'node', args, options);
  }
  const toolchain = selfRepairToolchainPaths();
  return execFileAsync(toolchain.node, args, withSelfRepairToolchainEnv(options, toolchain));
}

async function runToolchainNpm(args, options={}) {
  if (!app.isPackaged) {
    return execFileAsync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, options);
  }
  const toolchain = selfRepairToolchainPaths();
  return execFileAsync(toolchain.node, [toolchain.npmCli, ...args], withSelfRepairToolchainEnv(options, toolchain));
}

function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function developerBackupRoot() { return path.join(app.getPath('userData'),'developer-repair-backups'); }
function developerSandboxRoot() { return path.join(app.getPath('userData'),'developer-repair-sandboxes'); }
function autonomousRepairStatePath() { return path.join(app.getPath('userData'),'autonomous-self-repair-state.json'); }
function autonomousWorkspaceRoot() { return path.join(app.getPath('documents'),'Jarvis Self-Development'); }
function crashLogPath() { return path.join(app.getPath('userData'),'crash-watchdog','crashes.jsonl'); }
function crashRecoveryStatePath() { return path.join(app.getPath('userData'),'crash-watchdog','recovery.json'); }

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

function activeAutonomousStatus(status='') {
  return new Set([
    'RUNNING','ANALYZING','SANDBOX_TESTING','APPLYING_VERIFIED_PATCH','PATCH_VERIFIED',
    'PLANNER_RETRY','PLAN_RETRY','SANDBOX_RETRY','VALIDATION_RETRY','ROLLED_BACK_RETRY',
    'BUILDING_RELEASE_CANDIDATE','STOP_REQUESTED'
  ]).has(String(status));
}

function scheduleCrashAutopilot(crashEntry) {
  const state=readAutonomousRepairState();
  if (state.autoCrashRepair !== true || activeAutonomousStatus(state.status)) return;
  const goal=[
    'Crash Watchdog detected a Jarvis runtime failure.',
    'Analyze the crash evidence, identify the smallest safe source-level fix if supported by evidence,',
    'run sandbox validation and full tests, and prepare a release candidate without publishing it.',
    'Crash evidence: ' + JSON.stringify(crashEntry)
  ].join(' ');
  setTimeout(()=>{
    runAutonomousSelfRepair({goal,maxIterations:3}).catch((error)=>{
      recordCrash('crash-autopilot-failed',{message:String(error?.message || error),sourceCrashId:crashEntry.id});
    });
  },2500);
}

function registerCrashWatchdog(win) {
  if (!win?.webContents) return;
  win.webContents.on('render-process-gone', (_event, details={}) => {
    const crash=recordCrash('renderer-process-gone',{
      reason:details.reason || 'unknown',
      exitCode:details.exitCode ?? null
    });
    scheduleCrashAutopilot(crash);

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

function readAutonomousRepairState() {
  return readJson(autonomousRepairStatePath(), {
    status:'IDLE',
    workspace:null,
    goal:null,
    iteration:0,
    applied:[],
    releaseCandidate:null,
    releaseApproved:false,
    autoCrashRepair:false,
    updatedAt:null
  });
}

function writeAutonomousRepairState(patch={}) {
  const current = readAutonomousRepairState();
  const next = { ...current, ...patch, updatedAt:new Date().toISOString() };
  writeJson(autonomousRepairStatePath(), next);
  return next;
}

async function ensureAutonomousWorkspace() {
  const target = autonomousWorkspaceRoot();
  fs.mkdirSync(target,{recursive:true});

  const sourceRoot = autonomousSourceRoot();
  const entries = [
    'src','electron','security','build','scripts',
    'package.json','package-lock.json','index.html','eslint.config.js',
    'postcss.config.js','tailwind.config.js','vite.config.js','tsconfig.json',
    'jsconfig.json','components.json','THIRD_PARTY_NOTICES.md'
  ];

  // Repair partially-created or stale workspaces as well. Older builds could
  // leave package.json behind without package-lock.json; checking only for
  // package.json made every later Autopilot start fail permanently.
  for (const entry of entries) {
    const destination = path.join(target,entry);
    if (fs.existsSync(destination)) continue;

    const externalSource = path.join(sourceRoot,entry);
    const source = fs.existsSync(externalSource) ? externalSource : resourcePath(entry);

    if (!fs.existsSync(source)) {
      if (entry === 'package.json' || entry === 'package-lock.json') {
        throw new Error('AUTONOMOUS_REPAIR_SOURCE_MISSING:' + entry);
      }
      continue;
    }

    const stat = fs.statSync(source);
    if (stat.isDirectory()) {
      fs.cpSync(source,destination,{recursive:true});
    } else {
      fs.mkdirSync(path.dirname(destination),{recursive:true});
      fs.writeFileSync(destination,fs.readFileSync(source));
    }
  }

  const workspace = developerRepair.validateWorkspace(target);
  const lockPath = path.join(workspace,'package-lock.json');
  if (!fs.existsSync(lockPath)) throw new Error('AUTONOMOUS_REPAIR_LOCKFILE_REQUIRED');

  try {
    JSON.parse(fs.readFileSync(lockPath,'utf8'));
  } catch {
    throw new Error('AUTONOMOUS_REPAIR_LOCKFILE_INVALID');
  }

  if (!fs.existsSync(path.join(workspace,'node_modules'))) {
    await runToolchainNpm(['ci'],{
      cwd:workspace,
      windowsHide:true,
      timeout:600000,
      shell:false,
      maxBuffer:12 * 1024 * 1024
    });
  }
  return workspace;
}
async function runDeveloperValidation(workspace) {
  const testDir = path.join(workspace,'src','tests');
  const testFiles = fs.readdirSync(testDir).filter((name) => name.endsWith('.test.js')).map((name) => path.join('src','tests',name));
  const commands = [
    { label:'node --check electron/main.cjs', run:() => runToolchainNode(['--check','electron/main.cjs'],{cwd:workspace,windowsHide:true,timeout:180000,shell:false}) },
    { label:'node --test ' + testFiles.join(' '), run:() => runToolchainNode(['--test',...testFiles],{cwd:workspace,windowsHide:true,timeout:180000,shell:false}) },
    { label:'npm run lint', run:() => runToolchainNpm(['run','lint'],{cwd:workspace,windowsHide:true,timeout:180000,shell:false}) },
    { label:'npm run typecheck', run:() => runToolchainNpm(['run','typecheck'],{cwd:workspace,windowsHide:true,timeout:180000,shell:false}) },
    { label:'npm run verify:jarvis', run:() => runToolchainNpm(['run','verify:jarvis'],{cwd:workspace,windowsHide:true,timeout:180000,shell:false}) },
    { label:'npm run build', run:() => runToolchainNpm(['run','build'],{cwd:workspace,windowsHide:true,timeout:180000,shell:false}) },
  ];
  const results=[];
  for (const command of commands) {
    try {
      const { stdout, stderr } = await command.run();
      results.push({cmd:command.label,ok:true,output:(stdout||stderr||'').slice(-4000)});
    } catch (error) {
      results.push({cmd:command.label,ok:false,output:String(error?.stdout||error?.stderr||error?.message||error).slice(-4000)});
      return {ok:false,results};
    }
  }
  return {ok:true,results};
}
async function runReleaseCandidateValidation(workspace) {
  const sourceValidation = await runDeveloperValidation(workspace);
  if (!sourceValidation.ok) return sourceValidation;

  const packageResult = { cmd:'npm exec -- electron-builder --win nsis --x64 --publish never', ok:false, output:'' };
  try {
    const { stdout, stderr } = await runToolchainNpm(
      ['exec','--','electron-builder','--win','nsis','--x64','--publish','never'],
      { cwd:workspace, windowsHide:true, timeout:900000, shell:false, maxBuffer:16 * 1024 * 1024 }
    );
    packageResult.ok = true;
    packageResult.output = String(stdout || stderr || '').slice(-5000);
  } catch (error) {
    packageResult.output = String(error?.stdout || error?.stderr || error?.message || error).slice(-5000);
    return { ok:false, results:[...(sourceValidation.results || []), packageResult] };
  }

  const releaseDir = path.join(workspace,'release');
  const installer = fs.existsSync(releaseDir)
    ? fs.readdirSync(releaseDir)
        .filter((name) => /^Jarvis-Setup-.*-x64\.exe$/i.test(name))
        .map((name) => path.join(releaseDir,name))
        .sort((a,b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
    : null;
  if (!installer || !fs.existsSync(installer)) {
    return {
      ok:false,
      results:[...(sourceValidation.results || []), packageResult, { cmd:'installer-artifact', ok:false, output:'Jarvis installer was not produced.' }]
    };
  }

  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
  const signature = await getAuthenticodeSignature(installer).catch((error)=>({
    status:'Unavailable',
    thumbprint:'',
    subject:'',
    error:String(error?.message || error)
  }));
  const signed = signature.status === 'Valid' && Boolean(signature.thumbprint);
  const manifest = {
    version:JSON.parse(fs.readFileSync(path.join(workspace,'package.json'),'utf8')).version,
    builtAt:new Date().toISOString(),
    installer,
    sha256,
    signing:{
      signed,
      status:signature.status || 'Unknown',
      subject:signature.subject || null,
      thumbprint:signature.thumbprint || null
    },
    validation:(sourceValidation.results || []).map((item)=>({cmd:item.cmd,ok:item.ok})),
  };
  const manifestPath=path.join(releaseDir,'release-candidate-manifest.json');
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2),'utf8');
  return {
    ok:true,
    results:[...(sourceValidation.results || []), packageResult, { cmd:'installer-artifact', ok:true, output:installer }, {cmd:'release-manifest',ok:true,output:manifestPath}],
    installer,
    sha256,
    signature,
    signed,
    manifest,
    manifestPath
  };
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
  if (raw.openRouterKey && raw.openRouterKey.type !== 'safeStorage') {
    delete raw.openRouterKey;
    writeJson(file, raw);
    return true;
  }
  return false;
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
    developerSandboxRoot(),
    path.join(userData, 'self-repair-learning.json'),
    path.join(userData, 'crash-watchdog'),
    autonomousRepairStatePath(),
    autonomousWorkspaceRoot(),
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

async function openRouterRequest(payload={}) {
  if (payloadContainsSensitiveContext(payload)) {
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
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:'POST',
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
}

async function testOpenRouterConnection(candidateApiKey = '') {
  const raw = readJson(settingsPath(), {});
  const apiKey = String(candidateApiKey || '').trim() || unprotectSecret(raw.openRouterKey);
  if (!apiKey) throw new Error('OPENROUTER_API_KEY_REQUIRED');
  const response = await fetch('https://openrouter.ai/api/v1/models?sort=most-popular', {
    headers:{ Authorization:`Bearer ${apiKey}`, 'User-Agent':'Jarvis-Desktop' }
  });
  if (!response.ok) throw new Error(`OPENROUTER_CONNECTION_${response.status}`);
  const json = await response.json();
  const models = Array.isArray(json?.data) ? json.data : [];
  return { success:true, modelCount:models.length, routingMode:raw.aiRoutingMode || 'smart', costTier:raw.aiCostTier || 'low' };
}

async function listOpenRouterImageModels(apiKey) {
  const response = await fetch('https://openrouter.ai/api/v1/images/models', {
    headers:{ Authorization:`Bearer ${apiKey}`, 'User-Agent':'Jarvis-Desktop' }
  });
  if (!response.ok) throw new Error(`OPENROUTER_IMAGE_MODELS_${response.status}`);
  const json = await response.json();
  return Array.isArray(json?.data) ? json.data : [];
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

  const response = await fetch('https://openrouter.ai/api/v1/images', {
    method:'POST',
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
  const response = await fetch('https://openrouter.ai/api/v1/models?output_modalities=speech', { headers });
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
    const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method:'POST',
      headers:openRouterAudioHeaders(apiKey),
      body:JSON.stringify({
        model,
        input,
        voice,
        response_format:responseFormat
      })
    });

    if (response.ok) return { response, errorBody:'' };

    const errorBody = (await response.text()).slice(0,700);
    last = { status:response.status, errorBody };
    if (!retryable.has(response.status) || attempt > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
  }

  return { response:null, ...(last || { status:500, errorBody:'UNKNOWN_TTS_ERROR' }) };
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
      if (!attempt.response) {
        lastError = `OPENROUTER_TTS_${attempt.status}:${attempt.errorBody}`;
        continue;
      }

      const contentType = String(attempt.response.headers.get('content-type') || '').toLowerCase();
      let audioBuffer = Buffer.from(await attempt.response.arrayBuffer());
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
          generationId:attempt.response.headers.get('x-generation-id') || null
        }
      };
    }
  }

  throw new Error(lastError);
}

function getSelfRepairRoot() {
  return resourcePath();
}

async function selfRepairMap(payload={}) {
  const context = developerRepair.buildDiagnosticContext(getSelfRepairRoot(), String(payload?.query || ''), { maxFiles:12, maxChars:26000 });
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
  const message = String(payload?.message || '').trim();
  if (!message) throw new Error('SELF_REPAIR_MESSAGE_REQUIRED');
  const language = String(payload?.language || 'hu').toLowerCase();
  const history = Array.isArray(payload?.history) ? payload.history.slice(-10) : [];
  const context = developerRepair.buildDiagnosticContext(getSelfRepairRoot(), message, { maxFiles:20, maxChars:62000 });
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
  const crashHistory = readRecentCrashes(8);
  const crashText = crashHistory.length ? JSON.stringify(crashHistory,null,2).slice(0,18000) : '(no recent crash records)';
  const langRule = language === 'hu'
    ? 'Válaszolj kizárólag magyarul.'
    : 'Reply in the selected application language when possible.';

  const prompt = `You are Jarvis Self-Repair, a source-aware software diagnostic engineer embedded in the Jarvis Windows app.
You are NOT limited to reading filenames: reason about architecture, imports, state flow, IPC boundaries, UI behavior, tests and likely failure modes.
Use only evidence from the project map and source excerpts below. Clearly separate confirmed code facts from hypotheses.
You may propose concrete file-level repairs and validation steps. Manual repair mode remains approval-gated. In Autopilot mode, Jarvis may apply only sandbox-verified, fully validated, unprotected source changes automatically. Never claim or attempt to publish a release without the owner's separate release approval.
When asked to find bugs, inspect interactions across files, not just isolated syntax.
Follow dependency edges, route reachability and IPC channels before claiming that code is active.
Treat files marked inactive-or-unreferenced as dormant unless another runtime path proves otherwise.
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
    contains_sensitive_context:Boolean(adminDiagnosticsManager?.isActive?.() || crashHistory.length)
  });
  return {
    data:{
      reply:String(response?.data?.result || '').trim(),
      model:response?.data?.model || null,
      requestedModel:response?.data?.requestedModel || null,
      map:context.map,
      files:context.excerpts.map(item=>item.path)
    }
  };
}


function parseRepairModelJson(value) {
  if (value && typeof value === 'object') return value;
  const raw = String(value || '').trim();
  if (!raw) throw new Error('AUTONOMOUS_REPAIR_EMPTY_MODEL_RESPONSE');
  const cleaned = raw
    .replace(/^\`\`\`(?:json)?\s*/i,'')
    .replace(/\s*\`\`\`$/,'')
    .trim();
  try { return JSON.parse(cleaned); }
  catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start,end+1));
    throw new Error('AUTONOMOUS_REPAIR_INVALID_JSON');
  }
}

function summarizeValidation(validation) {
  if (!validation?.results?.length) return validation?.ok ? 'OK' : 'No validation details';
  return validation.results
    .map((item) => `${item.cmd}: ${item.ok ? 'OK' : 'FAIL'} ${item.ok ? '' : String(item.output || '').slice(-1800)}`)
    .join('\n');
}

async function generateAutonomousRepairProposal(workspace, goal, feedback='', iteration=1) {
  const query = [goal, feedback].filter(Boolean).join('\n\n');
  const context = developerRepair.buildDiagnosticContext(workspace, query, { maxFiles:20, maxChars:70000 });
  const learned = selfRepairLearning?.relevant?.(query, 10) || [];
  const learnedText = learned.length
    ? learned.map((item) => `- ${item.title} | files=${(item.files || []).join(', ')} | validation=${item.validation || '-'}`).join('\n')
    : '(no verified prior lessons)';
  const source = context.excerpts.map((item) =>
    `--- ${item.path} [${item.reachability}] ---\n${item.excerpt}`
  ).join('\n\n');

  const prompt = `You are the autonomous Jarvis Self-Repair planner.
Your job is to improve the supplied Jarvis development workspace until the requested goal is satisfied and all validations pass.

Hard rules:
- Never edit protected core/security paths. The runtime will reject them.
- Never publish, tag, push a release, or change GitHub workflow files.
- Prefer the smallest exact change that solves the current problem.
- Return JSON only.
- Use exact text replacements when possible. Each replacement search string must match source text exactly and uniquely.
- If the goal is already satisfied and no source change is needed, return {"done":true,"reason":"...","patches":[]}.
- Otherwise return:
{
  "done": false,
  "goal": "short goal",
  "rationale": "why these edits solve the problem",
  "risk": "low|medium|high",
  "patches": [
    {
      "file": "relative/path",
      "replacements": [
        {"search":"exact existing block","replace":"replacement block","all":false}
      ]
    }
  ]
}
- Maximum 6 files and 8 replacements per file.
- Do not use placeholders, ellipses, or partial pseudo-code in replacement text.
- Do not modify package version for release. Release/version publication is owner-gated and happens later.

OWNER GOAL:
${goal}

ITERATION:
${iteration}

PREVIOUS VALIDATION / REVISION FEEDBACK:
${feedback || '(none)'}

VERIFIED LOCAL LESSONS:
${learnedText}

PROJECT MAP:
${JSON.stringify(context.map,null,2)}

RELEVANT SOURCE:
${source}`;

  const response = await openRouterRequest({
    prompt,
    task_type:'repair',
    response_json_schema:{ type:'object' },
    contains_sensitive_context:false
  });

  return {
    proposal:parseRepairModelJson(response?.data?.result),
    model:response?.data?.model || null,
    files:context.excerpts.map((item) => item.path)
  };
}

async function runAutonomousSelfRepair(payload={}) {
  if (!localOwnerAuthorised()) throw new Error('AUTONOMOUS_REPAIR_UNAUTHORISED');

  const requestedGoal = String(payload?.goal || '').trim();
  if (!requestedGoal) throw new Error('AUTONOMOUS_REPAIR_GOAL_REQUIRED');

  const maxIterations = Math.max(1,Math.min(6,Number(payload?.maxIterations) || 4));
  const workspace = payload?.workspace
    ? developerRepair.validateWorkspace(String(payload.workspace))
    : await ensureAutonomousWorkspace();

  autonomousRepairStopRequested = false;
  const runId = crypto.randomUUID();
  let feedback = '';
  const applied = [];

  writeAutonomousRepairState({
    runId,
    status:'RUNNING',
    workspace,
    goal:requestedGoal,
    iteration:0,
    applied:[],
    releaseCandidate:null,
    releaseApproved:false,
    releaseApprovedAt:null,
    autoCrashRepair:true,
    lastError:null
  });

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    if (autonomousRepairStopRequested) {
      return writeAutonomousRepairState({ status:'STOPPED', iteration, applied });
    }

    writeAutonomousRepairState({ status:'ANALYZING', iteration, applied, feedback:feedback.slice(-6000) });

    let generated;
    try {
      generated = await generateAutonomousRepairProposal(workspace, requestedGoal, feedback, iteration);
    } catch (error) {
      feedback = `Planner error: ${error?.message || error}`;
      writeAutonomousRepairState({ status:'PLANNER_RETRY', iteration, applied, lastError:feedback });
      continue;
    }

    const proposal = generated.proposal || {};
    const patches = Array.isArray(proposal.patches) ? proposal.patches : [];
    if (proposal.done === true || patches.length === 0) {
      writeAutonomousRepairState({ status:'BUILDING_RELEASE_CANDIDATE', iteration, applied, lastError:null });
      const finalValidation = await runReleaseCandidateValidation(workspace);
      if (!finalValidation.ok) {
        feedback = `The model considered the goal complete, but release-candidate validation failed:\n${summarizeValidation(finalValidation)}`;
        writeAutonomousRepairState({ status:'VALIDATION_RETRY', iteration, applied, lastError:feedback });
        continue;
      }

      const candidate = {
        id:crypto.randomUUID(),
        runId,
        workspace,
        goal:requestedGoal,
        applied,
        model:generated.model,
        validation:finalValidation,
        installer:finalValidation.installer || null,
        sha256:finalValidation.sha256 || null,
        signed:finalValidation.signed === true,
        signature:finalValidation.signature || null,
        manifest:finalValidation.manifest || null,
        manifestPath:finalValidation.manifestPath || null,
        changedFiles:[...new Set(applied.flatMap((item)=>item.files || []))],
        riskSummary:applied.some((item)=>item.risk === 'high') ? 'high' : applied.some((item)=>item.risk === 'medium') ? 'medium' : 'low',
        createdAt:new Date().toISOString(),
        releaseApproved:false
      };
      return writeAutonomousRepairState({
        status:'RELEASE_CANDIDATE_READY',
        iteration,
        applied,
        releaseCandidate:candidate,
        releaseApproved:false,
        lastError:null
      });
    }

    let plan;
    try {
      plan = developerRepair.validatePlan(workspace,{
        goal:proposal.goal || requestedGoal,
        rationale:proposal.rationale || 'Autonomous Self-Repair proposal',
        risk:proposal.risk || 'medium',
        patches
      });
    } catch (error) {
      feedback = `Plan rejected by safety validator: ${error?.message || error}. Choose another unprotected implementation path and return a corrected plan.`;
      writeAutonomousRepairState({ status:'PLAN_RETRY', iteration, applied, lastError:feedback });
      continue;
    }

    writeAutonomousRepairState({
      status:'SANDBOX_TESTING',
      iteration,
      applied,
      currentPlan:{ hash:plan.hash, goal:plan.goal, files:plan.patches.map((patch) => patch.file), risk:plan.risk }
    });

    let sandbox = null;
    try {
      sandbox = developerRepair.createSandbox(workspace,plan,developerSandboxRoot());
      const sandboxValidation = await runDeveloperValidation(sandbox);
      if (!sandboxValidation.ok) {
        feedback = `Sandbox validation failed. Revise the plan instead of publishing or applying it:\n${summarizeValidation(sandboxValidation)}`;
        developerRepair.destroySandbox(sandbox,developerSandboxRoot());
        sandbox = null;
        writeAutonomousRepairState({ status:'SANDBOX_RETRY', iteration, applied, lastError:feedback });
        continue;
      }

      const backup = developerRepair.snapshot(workspace,plan,developerBackupRoot());
      writeAutonomousRepairState({ status:'APPLYING_VERIFIED_PATCH', iteration, applied, backup });

      try {
        developerRepair.apply(workspace,plan);
        const validation = await runDeveloperValidation(workspace);
        if (!validation.ok) {
          developerRepair.rollback(workspace,backup);
          feedback = `The patch passed sandbox but failed after application and was rolled back:\n${summarizeValidation(validation)}`;
          writeAutonomousRepairState({ status:'ROLLED_BACK_RETRY', iteration, applied, lastError:feedback });
          continue;
        }

        const verified = {
          hash:plan.hash,
          goal:plan.goal,
          files:plan.patches.map((patch) => patch.file),
          risk:plan.risk,
          validation:summarizeValidation(validation),
          appliedAt:new Date().toISOString()
        };
        applied.push(verified);
        selfRepairLearning?.recordVerified?.({
          title:plan.goal || 'Autonomous Self-Repair',
          repairId:plan.hash,
          files:verified.files,
          evidence:plan.rationale || requestedGoal,
          validation:verified.validation,
          success:true
        });
        feedback = `Verified patch applied successfully. Re-scan the updated workspace and decide whether more work is needed. Applied files: ${verified.files.join(', ')}.`;
        writeAutonomousRepairState({ status:'PATCH_VERIFIED', iteration, applied, lastError:null });
      } catch (error) {
        try { developerRepair.rollback(workspace,backup); } catch {}
        feedback = `Application failed and was rolled back: ${error?.message || error}`;
        writeAutonomousRepairState({ status:'ROLLED_BACK_RETRY', iteration, applied, lastError:feedback });
      }
    } finally {
      if (sandbox) {
        try { developerRepair.destroySandbox(sandbox,developerSandboxRoot()); } catch {}
      }
    }
  }

  const finalValidation = await runDeveloperValidation(workspace);
  const finalStatus = finalValidation.ok && applied.length
    ? 'NEEDS_OWNER_REVIEW_BEFORE_RELEASE'
    : 'NEEDS_ATTENTION';

  return writeAutonomousRepairState({
    status:finalStatus,
    iteration:maxIterations,
    applied,
    validation:finalValidation,
    lastError:feedback || null
  });
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
    case 'validateFileUpload': {
      const fileUrl = payload?.file_url || payload?.url || null;
      return { data:{ valid:Boolean(fileUrl), allowed:Boolean(fileUrl), file_url:fileUrl } };
    }
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
  const res=await fetch(UPDATE_API,{headers:{'Accept':'application/vnd.github+json','User-Agent':'Jarvis-Desktop-Updater'}});
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
  return {latestVersion, releaseName:release.name||release.tag_name, publishedAt:release.published_at, exe, checksum};
}
async function downloadFile(url,destination) {
  const res=await fetch(url,{redirect:'follow',headers:{'User-Agent':'Jarvis-Desktop-Updater'}});
  if(!res.ok || !res.body) throw new Error(`UPDATE_DOWNLOAD_${res.status}`);
  await pipeline(Readable.fromWeb(res.body),fs.createWriteStream(destination));
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

  await downloadFile(release.exe.browser_download_url,installerPath);
  await downloadFile(release.checksum.browser_download_url,checksumPath);

  const checksumText=fs.readFileSync(checksumPath,'utf8');
  const expected=(checksumText.match(/\b[a-f0-9]{64}\b/i)||[])[0]?.toLowerCase();
  if(!expected) throw new Error('UPDATE_CHECKSUM_INVALID');
  const actual=await sha256File(installerPath);
  if(actual!==expected) {
    try { fs.unlinkSync(installerPath); } catch {}
    throw new Error('UPDATE_CHECKSUM_MISMATCH');
  }

  const signer = await verifyUpdateSigner(installerPath);

  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const backupRoot=path.join(app.getPath('documents'),'Jarvis Backups',stamp);
  const helperPath=path.join(tempDir,'install-update.ps1');
  const appExe=process.execPath;
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
    verification:signer.verification,
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

  const host = base.hostname.toLowerCase();
  const privateIpv4 = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
  const privateIpv6 = host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
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
    if (!['http:','https:'].includes(parsed.protocol)) return;
    void shell.openExternal(parsed.toString()).catch(()=>{});
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
    if (permission !== 'media') return true;
    const requestingUrl = details.requestingUrl || webContents?.getURL?.() || requestingOrigin || '';
    const mediaType = details.mediaType || 'unknown';
    return trustedRequester(webContents, requestingUrl)
      && (mediaType === 'audio' || mediaType === 'unknown');
  });

  ses.setPermissionRequestHandler((webContents, permission, callback, details={}) => {
    if (permission !== 'media') {
      callback(true);
      return;
    }
    const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
    const requestingUrl = details.requestingUrl || webContents?.getURL?.() || details.securityOrigin || '';
    const requestsVideo = mediaTypes.includes('video');
    const requestsAudio = mediaTypes.length === 0 || mediaTypes.includes('audio');
    callback(trustedRequester(webContents, requestingUrl) && requestsAudio && !requestsVideo);
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
    const res=await fetch('https://openrouter.ai/api/v1/models',{headers:{Authorization:`Bearer ${key}`}});
    if(!res.ok) throw new Error(`OPENROUTER_MODELS_${res.status}`);
    const json=await res.json();
    return (json.data||[]).map(m=>({id:m.id,name:m.name||m.id,context_length:m.context_length||null,pricing:m.pricing||null}));
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
  ipcMain.handle('jarvis:self-repair:auto:status', () => readAutonomousRepairState());
  ipcMain.handle('jarvis:self-repair:auto:crash-mode', async (_e, enabled=false) => {
    if (enabled === true) {
      await requireOwnerPresence({
        title:'Automatikus crash-javítás',
        message:'Engedélyezed, hogy Jarvis egy későbbi összeomlás után automatikusan elindítsa a Self-Repair Autopilotot?',
        detail:'A javítás továbbra is sandboxban és teljes validációval fut. Release-t nem publikálhat külön tulajdonosi jóváhagyás nélkül.'
      });
    } else if (!localOwnerAuthorised()) {
      throw new Error('AUTONOMOUS_REPAIR_UNAUTHORISED');
    }
    return writeAutonomousRepairState({ autoCrashRepair:enabled === true });
  });
  ipcMain.handle('jarvis:self-repair:auto:workspace', async () => {
    if (!localOwnerAuthorised()) throw new Error('AUTONOMOUS_REPAIR_UNAUTHORISED');
    const workspace = await ensureAutonomousWorkspace();
    return { success:true, workspace };
  });
  ipcMain.handle('jarvis:self-repair:auto:run', async (_e, request={}) => {
    await requireOwnerPresence({
      title:'Autopilot önfejlesztés',
      message:'Engedélyezed az Autopilot futtatását?',
      detail:'Az Autopilot sandboxban tesztelhet és a fejlesztési munkamásolatot módosíthatja. Kiadást továbbra sem publikálhat külön tulajdonosi jóváhagyás nélkül.'
    });
    return runAutonomousSelfRepair(request);
  });
  ipcMain.handle('jarvis:self-repair:auto:stop', () => {
    if (!localOwnerAuthorised()) throw new Error('AUTONOMOUS_REPAIR_UNAUTHORISED');
    autonomousRepairStopRequested = true;
    return writeAutonomousRepairState({ status:'STOP_REQUESTED', autoCrashRepair:false });
  });
  ipcMain.handle('jarvis:self-repair:release:approve', async (_e, request={}) => {
    await requireOwnerPresence({
      title:'Release jóváhagyása',
      message:'Engedélyezed ennek a tesztelt release candidate-nek a kiadási jóváhagyását?',
      detail:'Ez csak a Jarvis belső release-kapuját nyitja meg. GitHub publikálás továbbra is külön, explicit kiadási lépést igényel.'
    });
    const state = readAutonomousRepairState();
    const candidate = state.releaseCandidate;
    if (!candidate?.id || candidate.id !== String(request.candidateId || '')) {
      throw new Error('RELEASE_CANDIDATE_NOT_FOUND');
    }
    if (!['RELEASE_CANDIDATE_READY','NEEDS_OWNER_REVIEW_BEFORE_RELEASE'].includes(state.status)) {
      throw new Error('RELEASE_CANDIDATE_NOT_READY');
    }
    return writeAutonomousRepairState({
      releaseApproved:true,
      releaseApprovedAt:new Date().toISOString(),
      status:'RELEASE_APPROVED_BY_OWNER'
    });
  });
  ipcMain.handle('jarvis:self-repair:release:revoke', () => {
    if (!localOwnerAuthorised()) throw new Error('AUTONOMOUS_REPAIR_UNAUTHORISED');
    const state = readAutonomousRepairState();
    return writeAutonomousRepairState({
      releaseApproved:false,
      releaseApprovedAt:null,
      status:state.releaseCandidate ? 'RELEASE_CANDIDATE_READY' : state.status
    });
  });

  ipcMain.handle('jarvis:developer:plan', (_e, request={}) => {
    if (!localOwnerAuthorised()) throw new Error('DEV_REPAIR_UNAUTHORISED');
    const workspace = developerRepair.validateWorkspace(String(request.workspace || ''));
    const plan = developerRepair.validatePlan(workspace, request.plan || {});
    developerPlans.set(plan.hash,{workspace,plan,approved:false,createdAt:Date.now()});
    return plan;
  });
  ipcMain.handle('jarvis:developer:sandbox', async (_e, request={}) => {
    if (!localOwnerAuthorised()) throw new Error('DEV_REPAIR_UNAUTHORISED');
    const hash=String(request.hash||'');
    const entry=developerPlans.get(hash);
    if(!entry) throw new Error('DEV_REPAIR_PLAN_NOT_FOUND');
    if(Date.now()-entry.createdAt > 30*60*1000) throw new Error('DEV_REPAIR_PLAN_EXPIRED');
    const approvedPlan={...entry.plan}; delete approvedPlan.hash;
    if(developerRepair.proposalHash(approvedPlan)!==hash) throw new Error('DEV_REPAIR_PLAN_MUTATED');
    if(entry.sandbox) { try { developerRepair.destroySandbox(entry.sandbox,developerSandboxRoot()); } catch {} }
    const sandbox=developerRepair.createSandbox(entry.workspace,entry.plan,developerSandboxRoot());
    entry.sandbox=sandbox;
    const validation=await runDeveloperValidation(sandbox);
    entry.sandboxValidation=validation;
    entry.sandboxVerified=Boolean(validation.ok);
    entry.sandboxVerifiedAt=validation.ok?Date.now():null;
    if(!validation.ok) {
      developerRepair.destroySandbox(sandbox,developerSandboxRoot());
      entry.sandbox=null;
      return {success:false,status:'SANDBOX_FAILED',hash,validation};
    }
    return {success:true,status:'SANDBOX_VERIFIED',hash,validation,files:entry.plan.patches.map(p=>p.file)};
  });
  ipcMain.handle('jarvis:developer:approve', async (_e, request={}) => {
    await requireOwnerPresence({
      title:'Fejlesztői javítás jóváhagyása',
      message:'Engedélyezed a sandboxban ellenőrzött javítás alkalmazási jóváhagyását?',
      detail:'A terv csak sikeres sandbox-ellenőrzés után hagyható jóvá, és alkalmazás után ismét teljes validáció fut.'
    });
    const entry=developerPlans.get(String(request.hash||''));
    if(!entry) throw new Error('DEV_REPAIR_PLAN_NOT_FOUND');
    if(Date.now()-entry.createdAt > 30*60*1000) throw new Error('DEV_REPAIR_PLAN_EXPIRED');
    if(!entry.sandboxVerified || !entry.sandboxValidation?.ok) throw new Error('DEV_REPAIR_SANDBOX_VERIFICATION_REQUIRED');
    entry.approved=true; entry.approvedAt=Date.now();
    return {success:true,hash:entry.plan.hash,status:'APPROVED_AFTER_SANDBOX'};
  });
  ipcMain.handle('jarvis:developer:apply', (_e, request={}) => guarded(
    {type:'system_repair',target:'developer-workspace'},
    async () => {
      const hash=String(request.hash||'');
      const entry=developerPlans.get(hash);
      if(!entry || !entry.approved) throw new Error('DEV_REPAIR_APPROVAL_REQUIRED');
      if(!entry.sandboxVerified || !entry.sandboxValidation?.ok) throw new Error('DEV_REPAIR_SANDBOX_VERIFICATION_REQUIRED');
      const approvedPlan={...entry.plan}; delete approvedPlan.hash;
      if(developerRepair.proposalHash(approvedPlan)!==hash) throw new Error('DEV_REPAIR_PLAN_MUTATED');
      const backup=developerRepair.snapshot(entry.workspace,entry.plan,developerBackupRoot());
      try {
        developerRepair.apply(entry.workspace,entry.plan);
        const validation=await runDeveloperValidation(entry.workspace);
        if(!validation.ok) {
          developerRepair.rollback(entry.workspace,backup);
          if(entry.sandbox) developerRepair.destroySandbox(entry.sandbox,developerSandboxRoot());
          developerPlans.delete(hash);
          return {success:false,status:'ROLLED_BACK',hash,backup,sandboxValidation:entry.sandboxValidation,validation};
        }
        if(entry.sandbox) developerRepair.destroySandbox(entry.sandbox,developerSandboxRoot());
        selfRepairLearning?.recordVerified?.({
          title:entry.plan.goal || 'Self-Repair fejlesztői javítás',
          repairId:hash,
          files:entry.plan.patches.map((patch) => patch.file),
          evidence:entry.plan.rationale || entry.plan.goal || '',
          validation:(validation.results || []).map((item) => `${item.cmd}: ${item.ok ? 'OK' : 'FAIL'}`).join('; '),
          success:true
        });
        developerPlans.delete(hash);
        return {success:true,status:'APPLIED_AND_VERIFIED',hash,backup,sandboxValidation:entry.sandboxValidation,validation};
      } catch(error) {
        developerRepair.rollback(entry.workspace,backup);
        if(entry.sandbox) { try { developerRepair.destroySandbox(entry.sandbox,developerSandboxRoot()); } catch {} }
        developerPlans.delete(hash);
        throw error;
      }
    },
    {message:'A módosítás a sandboxban már sikeresen lefutott és a tulajdonos jóváhagyta. Jarvis mentést készít, alkalmazza a pontos tervet, majd újra ellenőrzi; hiba esetén automatikusan visszaáll.'}
  ));
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
