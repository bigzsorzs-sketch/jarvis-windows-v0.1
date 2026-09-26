'use strict';

const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, execFileSync } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { PolicyEngine } = require('./security/policy-engine.cjs');

const isDev = !app.isPackaged;
let mainWindow;
let policy;

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
  if (isDev) mainWindow.loadURL('http://127.0.0.1:5173');
  else mainWindow.loadFile(path.join(__dirname,'..','dist','index.html'));
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
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
