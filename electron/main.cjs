'use strict';

const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, execFileSync, spawn } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const execFileAsync = promisify(execFile);
const { PolicyEngine } = require('./security/policy-engine.cjs');

const isDev = !app.isPackaged;
let mainWindow;
let policy;
const stabilityState = {
  startedAt: Date.now(),
  rendererRestarts: [],
  lastRendererCrash: null,
  lastUnhandledError: null,
};

function stabilityLogPath() {
  return path.join(app.getPath('userData'), 'logs', 'stability.jsonl');
}
function serializeError(error) {
  if (!error) return null;
  return {
    name: error.name || 'Error',
    message: String(error.message || error),
    stack: String(error.stack || '').slice(0, 12000),
  };
}
function appendStabilityEvent(event, payload={}) {
  try {
    const file=stabilityLogPath();
    fs.mkdirSync(path.dirname(file), {recursive:true});
    fs.appendFileSync(file, JSON.stringify({ts:new Date().toISOString(),event,...payload})+'\n','utf8');
  } catch {}
}
function pruneRendererRestarts() {
  const cutoff=Date.now()-60_000;
  stabilityState.rendererRestarts=stabilityState.rendererRestarts.filter(ts=>ts>cutoff);
}
function getStabilityStatus() {
  pruneRendererRestarts();
  return {
    appVersion: app.getVersion(),
    uptimeSeconds: Math.floor((Date.now()-stabilityState.startedAt)/1000),
    rendererRestartsLastMinute: stabilityState.rendererRestarts.length,
    lastRendererCrash: stabilityState.lastRendererCrash,
    lastUnhandledError: stabilityState.lastUnhandledError,
    logPath: stabilityLogPath(),
    safeModeRecommended: stabilityState.rendererRestarts.length >= 3,
  };
}

process.on('uncaughtException', (error) => {
  stabilityState.lastUnhandledError={type:'uncaughtException',at:new Date().toISOString(),error:serializeError(error)};
  appendStabilityEvent('uncaughtException',{error:serializeError(error)});
});
process.on('unhandledRejection', (reason) => {
  const error=reason instanceof Error ? reason : new Error(String(reason));
  stabilityState.lastUnhandledError={type:'unhandledRejection',at:new Date().toISOString(),error:serializeError(error)};
  appendStabilityEvent('unhandledRejection',{error:serializeError(error)});
});

function resourcePath(...parts) {
  return app.isPackaged ? path.join(process.resourcesPath, ...parts) : path.join(__dirname, '..', ...parts);
}

function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }

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
  if (safeStorage.isEncryptionAvailable()) return { type:'safeStorage', value:safeStorage.encryptString(value).toString('base64') };
  return { type:'plain-local-fallback', value:Buffer.from(value,'utf8').toString('base64') };
}
function unprotectSecret(entry) {
  if (!entry?.value) return '';
  try {
    const buf = Buffer.from(entry.value,'base64');
    if (entry.type === 'safeStorage' && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(buf);
    return buf.toString('utf8');
  } catch { return ''; }
}

function getSettingsInternal() {
  const raw = readJson(settingsPath(), {});
  return {
    language: raw.language || 'hu',
    aiProvider: raw.aiProvider || 'openrouter',
    aiModel: raw.aiModel || 'openrouter/auto',
    hasOpenRouterKey: Boolean(raw.openRouterKey),
  };
}

async function saveSettingsInternal(patch={}) {
  const raw = readJson(settingsPath(), {});
  if (typeof patch.language === 'string') raw.language = patch.language;
  if (typeof patch.aiProvider === 'string') raw.aiProvider = patch.aiProvider;
  if (typeof patch.aiModel === 'string') raw.aiModel = patch.aiModel;
  if (typeof patch.openRouterApiKey === 'string' && patch.openRouterApiKey.trim()) raw.openRouterKey = protectSecret(patch.openRouterApiKey.trim());
  if (patch.clearOpenRouterApiKey === true) delete raw.openRouterKey;
  writeJson(settingsPath(), raw);
  return getSettingsInternal();
}

async function openRouterRequest(payload={}) {
  const raw = readJson(settingsPath(), {});
  const apiKey = unprotectSecret(raw.openRouterKey);
  if (!apiKey) throw new Error('OPENROUTER_API_KEY_REQUIRED');
  const requestedModel = String(payload.model || '');
  const model = requestedModel.includes('/') ? requestedModel : (raw.aiModel || 'openrouter/auto');
  const messages = payload.messages || [{ role:'user', content:String(payload.prompt || '') }];
  const body = { model, messages };
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
  return { success:true, data:{ result, model:json.model || model, usage:json.usage || null } };
}

async function invokeJarvisFunction(name, payload={}) {
  switch (name) {
    case 'llmProxy': return openRouterRequest(payload);
    case 'runAiTask': {
      const r = await openRouterRequest(payload);
      return { data:{ result:r.data.result, model:r.data.model, usage:r.data.usage } };
    }
    case 'validateFileUpload': return { data:{ valid:true, allowed:true } };
    case 'sendFeedback': return { data:{ success:true, storedLocally:true } };
    case 'getActivePromptTunings': return { data:{ tunings:[] } };
    case 'deleteAccount': return { data:{ success:true, localOnly:true } };
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
    elevatedExpected:true,
    windows:win
  };
}


const UPDATE_REPO = 'bigzsorzs-sketch/jarvis-windows-v0.1';
const UPDATE_API = \`https://api.github.com/repos/\${UPDATE_REPO}/releases/latest\`;

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
  if(!res.ok) throw new Error(\`UPDATE_CHECK_\${res.status}\`);
  const release=await res.json();
  const latestVersion=String(release.tag_name||'').replace(/^v/i,'');
  const exe=(release.assets||[]).find(a => /^Jarvis-Setup-\d+\.\d+\.\d+-x64\.exe$/i.test(a.name||''));
  if(!exe) throw new Error('UPDATE_INSTALLER_NOT_FOUND');
  const checksum=(release.assets||[]).find(a => a.name === \`\${exe.name}.sha256\`);
  if(!checksum) throw new Error('UPDATE_CHECKSUM_NOT_FOUND');
  return {latestVersion, releaseName:release.name||release.tag_name, publishedAt:release.published_at, exe, checksum};
}
async function downloadFile(url,destination) {
  const res=await fetch(url,{redirect:'follow',headers:{'User-Agent':'Jarvis-Desktop-Updater'}});
  if(!res.ok || !res.body) throw new Error(\`UPDATE_DOWNLOAD_\${res.status}\`);
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
async function oneClickUpdate() {
  const currentVersion=app.getVersion();
  const release=await fetchLatestRelease();
  if(compareVersions(release.latestVersion,currentVersion)<=0) {
    return {status:'up-to-date',currentVersion,latestVersion:release.latestVersion};
  }

  const tempDir=path.join(app.getPath('temp'),\`Jarvis-Upgrade-\${release.latestVersion}\`);
  fs.mkdirSync(tempDir,{recursive:true});
  const installerPath=path.join(tempDir,release.exe.name);
  const checksumPath=\`\${installerPath}.sha256\`;

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

  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const backupRoot=path.join(app.getPath('documents'),'Jarvis Backups',stamp);
  const helperPath=path.join(tempDir,'install-update.ps1');
  const appExe=process.execPath;
  const userData=app.getPath('userData');
  const helper=\`
$ErrorActionPreference = 'Stop'
$pidToWait = \${process.pid}
$installer = '\${psQuote(installerPath)}'
$userData = '\${psQuote(userData)}'
$backup = '\${psQuote(backupRoot)}'
$appExe = '\${psQuote(appExe)}'
Wait-Process -Id $pidToWait -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $backup | Out-Null
if (Test-Path -LiteralPath $userData) {
  Copy-Item -LiteralPath $userData -Destination (Join-Path $backup 'UserData') -Recurse -Force
}
$p = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
if ($p.ExitCode -ne 0) { exit $p.ExitCode }
Start-Process -FilePath $appExe
\`;
  fs.writeFileSync(helperPath,helper,'utf8');

  const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',helperPath],{
    detached:true,stdio:'ignore',windowsHide:true
  });
  child.unref();
  setTimeout(()=>app.quit(),700);
  return {status:'installing',currentVersion,latestVersion:release.latestVersion,backupRoot};
}

function attachWindowStabilityHandlers(win) {
  win.webContents.on('render-process-gone', (_event, details) => {
    const crash={at:new Date().toISOString(),reason:details.reason,exitCode:details.exitCode};
    stabilityState.lastRendererCrash=crash;
    stabilityState.rendererRestarts.push(Date.now());
    pruneRendererRestarts();
    appendStabilityEvent('render-process-gone', crash);

    if (stabilityState.rendererRestarts.length <= 2 && !win.isDestroyed()) {
      setTimeout(() => {
        if (win.isDestroyed()) return;
        if (isDev) win.loadURL('http://127.0.0.1:5173');
        else win.loadFile(path.join(__dirname,'..','dist','index.html'));
      }, 800);
      return;
    }

    appendStabilityEvent('renderer-crash-loop-protection', {
      restartsLastMinute: stabilityState.rendererRestarts.length,
    });
  });

  win.on('unresponsive', () => appendStabilityEvent('window-unresponsive'));
  win.on('responsive', () => appendStabilityEvent('window-responsive'));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width:1400,
    height:900,
    minWidth:1000,
    minHeight:700,
    icon:resourcePath('build','icon.ico'),
    title:'Jarvis',
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      contextIsolation:true,
      nodeIntegration:false,
      sandbox:true,
      webSecurity:true
    }
  });
  mainWindow.removeMenu();
  attachWindowStabilityHandlers(mainWindow);
  if (isDev) mainWindow.loadURL('http://127.0.0.1:5173');
  else mainWindow.loadFile(path.join(__dirname,'..','dist','index.html'));
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  seedInitialSettings();
  policy = new PolicyEngine({
    rulesPath:resourcePath('security','core-rules.json'),
    signaturePath:resourcePath('security','core-rules.sig'),
    publicKeyPath:resourcePath('security','core-rules-public.pem'),
    auditPath:path.join(app.getPath('userData'),'audit','policy.jsonl')
  });

  ipcMain.handle('jarvis:policy:rules', () => policy.getPublicRules());
  ipcMain.handle('jarvis:policy:evaluate', (_e, action) => policy.evaluate(action));
  ipcMain.handle('jarvis:policy:override', (_e, req) => policy.requestOverride(req || {}));
  ipcMain.handle('jarvis:system:context', () => getSystemContext());
  ipcMain.handle('jarvis:settings:get', () => getSettingsInternal());
  ipcMain.handle('jarvis:settings:save', (_e, patch) => saveSettingsInternal(patch));
  ipcMain.handle('jarvis:function:invoke', (_e, name, payload) => invokeJarvisFunction(name, payload));
  ipcMain.handle('jarvis:ai:list-models', async () => {
    const raw=readJson(settingsPath(),{}); const key=unprotectSecret(raw.openRouterKey);
    if (!key) return [];
    const res=await fetch('https://openrouter.ai/api/v1/models',{headers:{Authorization:`Bearer ${key}`}});
    if(!res.ok) throw new Error(`OPENROUTER_MODELS_${res.status}`);
    const json=await res.json();
    return (json.data||[]).map(m=>({id:m.id,name:m.name||m.id,context_length:m.context_length||null,pricing:m.pricing||null}));
  });
  ipcMain.handle('jarvis:file:select', async (_e, options={}) => dialog.showOpenDialog(mainWindow,{properties:['openFile', ...(options.multiple?['multiSelections']:[]) ]}));
  ipcMain.handle('jarvis:update:one-click', () => oneClickUpdate());
  ipcMain.handle('jarvis:stability:status', () => getStabilityStatus());
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
