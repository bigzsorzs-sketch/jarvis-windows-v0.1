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
const { NativeObdBridge } = require('./obd/native-obd-bridge.cjs');
const { LocalDatabase } = require('./data/local-database.cjs');
const { BackupManager } = require('./data/backup-manager.cjs');
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

function resourcePath(...parts) {
  return app.isPackaged ? path.join(app.getAppPath(), ...parts) : path.join(__dirname, '..', ...parts);
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
    case 'gmailFetch': return { data:{ emails:[], connected:false, configured:false, reason:'GMAIL_OAUTH_NOT_CONFIGURED' } };
    case 'analyzeUploadedFiles': return { data:analyzeUploadedFiles(payload?.files || []) };
    case 'analyzeProjectDeep': return { data:analyzeProjectDeep(payload?.files || []) };
    case 'analyzeProjectSpecialists': return { data:analyzeProjectSpecialists(payload?.files || []) };
    case 'sendFeedback': return { data:{ success:true, storedLocally:true } };
    case 'getActivePromptTunings': return { data:{ tunings:[] } };
    case 'deleteAccount': database?.resetAll(); return { data:{ success:true, localOnly:true } };
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
  const latestVersion=String(release.tag_name||'').replace(/^v/i,'');
  const exe=(release.assets||[]).find(a => /^Jarvis-Setup-\d+\.\d+\.\d+-x64\.exe$/i.test(a.name||''));
  if(!exe) throw new Error('UPDATE_INSTALLER_NOT_FOUND');
  const checksum=(release.assets||[]).find(a => a.name === `${exe.name}.sha256`);
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
async function oneClickUpdate() {
  const currentVersion=app.getVersion();
  const release=await fetchLatestRelease();
  if(compareVersions(release.latestVersion,currentVersion)<=0) {
    return {status:'up-to-date',currentVersion,latestVersion:release.latestVersion};
  }

  const tempDir=path.join(app.getPath('temp'),`Jarvis-Upgrade-${release.latestVersion}`);
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
  return {status:'installing',currentVersion,latestVersion:release.latestVersion,backupRoot};
}

function functionPolicyAction(name, payload={}) {
  const hasExternalImages = ['llmProxy','runAiTask','generateImage'].includes(String(name))
    && (
      (Array.isArray(payload?.file_urls) && payload.file_urls.length > 0)
      || (Array.isArray(payload?.image_urls) && payload.image_urls.length > 0)
      || (Array.isArray(payload?.existing_image_urls) && payload.existing_image_urls.length > 0)
    );
  return {
    type: name === 'deleteAccount' ? 'account_delete' : `function:${String(name || 'unknown')}`,
    target:String(name || 'unknown'),
    authorised:true,
    transmitsSensitiveData:hasExternalImages
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
  const decision = policy.evaluate({ authorised:true, ...action });
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
    add('ai', 'AI konfiguráció', Boolean(raw.openRouterKey), raw.openRouterKey ? 'OpenRouter kulcs beállítva' : 'Nincs OpenRouter kulcs', raw.openRouterKey ? 'normal' : 'warning');
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

  return {
    checkedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    checks,
    ok: checks.every((check) => check.ok || check.severity !== 'critical')
  };
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
  configureObdBluetoothChooser(mainWindow);
  if (isDev) mainWindow.loadURL('http://127.0.0.1:5173');
  else mainWindow.loadFile(path.join(__dirname,'..','dist','index.html'));
}

app.whenReady().then(() => {
  seedInitialSettings();
  obdBridge = new NativeObdBridge();
  database = new LocalDatabase(path.join(app.getPath('userData'), 'data', 'jarvis.sqlite3'));
  backupManager = new BackupManager({ app, dialog, database, getSettings:getSettingsInternal, saveSettings:saveSettingsInternal });
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
  ipcMain.handle('jarvis:settings:save', (_e, patch) => guarded(
    { type:'local_settings_write', target:settingsPath() },
    () => saveSettingsInternal(patch)
  ));
  ipcMain.handle('jarvis:function:invoke', (_e, name, payload) => guarded(
    functionPolicyAction(name, payload || {}),
    () => invokeJarvisFunction(name, payload || {}),
    { message:'Jarvis egy külső AI-szolgáltatásnak képet vagy más érzékeny adatot küldene.' }
  ));
  ipcMain.handle('jarvis:ai:list-models', async () => {
    const raw=readJson(settingsPath(),{}); const key=unprotectSecret(raw.openRouterKey);
    if (!key) return [];
    const res=await fetch('https://openrouter.ai/api/v1/models',{headers:{Authorization:`Bearer ${key}`}});
    if(!res.ok) throw new Error(`OPENROUTER_MODELS_${res.status}`);
    const json=await res.json();
    return (json.data||[]).map(m=>({id:m.id,name:m.name||m.id,context_length:m.context_length||null,pricing:m.pricing||null}));
  });
  ipcMain.handle('jarvis:file:select', async (_e, options={}) => dialog.showOpenDialog(mainWindow,{properties:['openFile', ...(options.multiple?['multiSelections']:[]) ]}));
  ipcMain.handle('jarvis:update:one-click', () => guarded(
    { type:'system_file_write', target:process.execPath },
    () => oneClickUpdate(),
    { message:'Jarvis új telepítőt fog letölteni, ellenőrizni és rendszerszinten futtatni.' }
  ));
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
  ipcMain.handle('jarvis:data:user:update', (_e, patch={}) => database.updateUser(patch));
  ipcMain.handle('jarvis:backup:create', (_e, req={}) => guarded(
    { type:'backup_create', target:'Jarvis Backups' },
    () => backupManager.create(req.passphrase)
  ));
  ipcMain.handle('jarvis:backup:restore', (_e, req={}) => guarded(
    { type:'backup_restore', target:'local-database' },
    () => backupManager.restore(req.passphrase)
  ));
  ipcMain.handle('jarvis:system:check', () => runSystemCheck());
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => { obdBridge?.disconnect?.().catch(() => {}); database?.close?.(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
