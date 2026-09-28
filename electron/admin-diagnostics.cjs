'use strict';

const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const SESSION_TTL_MS = 30 * 60 * 1000;
const UAC_CONNECT_TIMEOUT_MS = 90 * 1000;
const MAX_TEXT_BYTES = 1024 * 1024;

function parseHelperArgs(argv=[]) {
  if (!argv.includes('--jarvis-admin-helper')) return null;
  const pipeArg = argv.find((arg) => String(arg).startsWith('--jarvis-admin-pipe='));
  const tokenArg = argv.find((arg) => String(arg).startsWith('--jarvis-admin-token='));
  const pipeName = String(pipeArg || '').slice('--jarvis-admin-pipe='.length);
  const token = String(tokenArg || '').slice('--jarvis-admin-token='.length);
  if (!/^[a-zA-Z0-9_-]{12,120}$/.test(pipeName) || !/^[a-f0-9]{32,128}$/i.test(token)) return null;
  return { pipeName, token };
}

function pipePath(pipeName) {
  return '\\\\.\\pipe\\' + pipeName;
}

function psQuote(value='') {
  return "'" + String(value).replace(/'/g,"''") + "'";
}

async function runPowerShell(script, timeout=15000) {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',script],
    { windowsHide:true, timeout, maxBuffer:8 * 1024 * 1024 }
  );
  return String(stdout || '').trim();
}

async function elevatedIdentity() {
  const script = [
    '$id=[Security.Principal.WindowsIdentity]::GetCurrent();',
    '$p=New-Object Security.Principal.WindowsPrincipal($id);',
    '$admin=$p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator);',
    '[pscustomobject]@{User=$id.Name;Elevated=$admin;Pid=$PID}|ConvertTo-Json -Compress'
  ].join('');
  try { return JSON.parse(await runPowerShell(script,5000)); }
  catch { return { User:os.userInfo().username, Elevated:false, Pid:process.pid }; }
}

async function systemSnapshot() {
  const script = [
    '$ErrorActionPreference="SilentlyContinue";',
    '$os=Get-CimInstance Win32_OperatingSystem;',
    '$cs=Get-CimInstance Win32_ComputerSystem;',
    '$bios=Get-CimInstance Win32_BIOS;',
    '$cpu=Get-CimInstance Win32_Processor | Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors;',
    '$gpu=Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion;',
    '$drives=Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,VolumeName,Size,FreeSpace,FileSystem;',
    '$procs=Get-Process | Sort-Object CPU -Descending | Select-Object -First 40 Id,ProcessName,CPU,WorkingSet64,Path;',
    '$services=Get-Service | Select-Object Name,DisplayName,Status,StartType;',
    '$net=Get-NetIPConfiguration | Select-Object InterfaceAlias,InterfaceDescription,@{N="IPv4";E={$_.IPv4Address.IPAddress}},@{N="Gateway";E={$_.IPv4DefaultGateway.NextHop}},@{N="DNS";E={$_.DNSServer.ServerAddresses}};',
    '$drivers=Get-CimInstance Win32_PnPSignedDriver | Select-Object -First 160 DeviceName,DriverVersion,Manufacturer,DriverDate;',
    '$events=Get-WinEvent -FilterHashtable @{LogName=@("System","Application");Level=1,2,3;StartTime=(Get-Date).AddDays(-2)} -MaxEvents 80 | Select-Object TimeCreated,LogName,Id,ProviderName,LevelDisplayName,Message;',
    '$uninstall=@("HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*","HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*");',
    '$apps=Get-ItemProperty $uninstall | Where-Object DisplayName | Sort-Object DisplayName | Select-Object -First 350 DisplayName,DisplayVersion,Publisher,InstallDate;',
    '$startup=Get-CimInstance Win32_StartupCommand | Select-Object Name,Command,Location,User;',
    '$tasks=Get-ScheduledTask | Select-Object -First 250 TaskName,TaskPath,State,Author;',
    '$firewall=Get-NetFirewallProfile | Select-Object Name,Enabled,DefaultInboundAction,DefaultOutboundAction;',
    '$updates=Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 120 HotFixID,Description,InstalledBy,InstalledOn;',
    '$defender=Get-MpComputerStatus | Select-Object AntivirusEnabled,AntispywareEnabled,RealTimeProtectionEnabled,BehaviorMonitorEnabled,IoavProtectionEnabled,AntivirusSignatureLastUpdated,QuickScanEndTime,FullScanEndTime;',
    '$obj=[pscustomobject]@{',
    'OS=[pscustomobject]@{Caption=$os.Caption;Version=$os.Version;Build=$os.BuildNumber;LastBoot=$os.LastBootUpTime};',
    'Computer=[pscustomobject]@{Manufacturer=$cs.Manufacturer;Model=$cs.Model;RAM=$cs.TotalPhysicalMemory;BIOS=$bios.SMBIOSBIOSVersion};',
    'CPU=$cpu;GPU=$gpu;Drives=$drives;Processes=$procs;Services=$services;Network=$net;Drivers=$drivers;RecentEvents=$events;InstalledApps=$apps;Startup=$startup;ScheduledTasks=$tasks;Firewall=$firewall;Updates=$updates;Defender=$defender};',
    '$obj|ConvertTo-Json -Depth 7 -Compress'
  ].join('');
  const raw = await runPowerShell(script,30000);
  return raw ? JSON.parse(raw) : {};
}

function listDirectory(target, depth=1, maxItems=800) {
  const base = path.resolve(String(target || ''));
  if (!path.isAbsolute(base)) throw new Error('ADMIN_PATH_ABSOLUTE_REQUIRED');
  const maxDepth = Math.max(0,Math.min(3,Number(depth)||1));
  const cap = Math.max(1,Math.min(2000,Number(maxItems)||800));
  const items=[];
  const visit=(dir,currentDepth)=>{
    if(items.length>=cap || currentDepth>maxDepth) return;
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      if(items.length>=cap) break;
      const full=path.join(dir,entry.name);
      let stat=null;
      try{stat=fs.statSync(full);}catch{}
      items.push({
        path:full,
        name:entry.name,
        directory:entry.isDirectory(),
        size:stat?.size || 0,
        modified:stat?.mtime?.toISOString?.() || null
      });
      if(entry.isDirectory() && currentDepth<maxDepth){
        try{visit(full,currentDepth+1);}catch{}
      }
    }
  };
  visit(base,0);
  return { base, items, truncated:items.length>=cap };
}

function readTextFile(target) {
  const file = path.resolve(String(target || ''));
  if (!path.isAbsolute(file)) throw new Error('ADMIN_PATH_ABSOLUTE_REQUIRED');
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error('ADMIN_FILE_REQUIRED');
  if (stat.size > MAX_TEXT_BYTES) throw new Error('ADMIN_FILE_TOO_LARGE');
  const buffer=fs.readFileSync(file);
  if (buffer.includes(0)) throw new Error('ADMIN_BINARY_FILE_BLOCKED');
  return { path:file, size:stat.size, text:buffer.toString('utf8') };
}

async function registryQuery(key) {
  const target=String(key || '').trim();
  if(!/^(HKLM|HKCU|HKEY_LOCAL_MACHINE|HKEY_CURRENT_USER)\\/i.test(target)) throw new Error('ADMIN_REGISTRY_KEY_NOT_ALLOWED');
  const { stdout } = await execFileAsync('reg.exe',['query',target,'/s'],{windowsHide:true,timeout:12000,maxBuffer:4*1024*1024});
  return { key:target, output:String(stdout||'').slice(0,4*1024*1024) };
}

async function handleOperation(operation,payload={}) {
  switch(operation){
    case 'ping': return { identity:await elevatedIdentity(), expiresInMs:SESSION_TTL_MS };
    case 'snapshot': return systemSnapshot();
    case 'listDirectory': return listDirectory(payload.path,payload.depth,payload.maxItems);
    case 'readTextFile': return readTextFile(payload.path);
    case 'registryQuery': return registryQuery(payload.key);
    case 'close': return { closing:true };
    default: throw new Error('ADMIN_OPERATION_NOT_ALLOWLISTED');
  }
}

async function startAdminHelper(config,{onClose}={}) {
  const server=net.createServer((socket)=>{
    let buffer='';
    socket.setEncoding('utf8');
    socket.on('data',(chunk)=>{
      buffer+=chunk;
      let index;
      while((index=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,index).trim();
        buffer=buffer.slice(index+1);
        if(!line) continue;
        void (async()=>{
          let request;
          try{
            request=JSON.parse(line);
            if(request.token!==config.token) throw new Error('ADMIN_SESSION_AUTH_FAILED');
            const result=await handleOperation(request.operation,request.payload||{});
            socket.write(JSON.stringify({id:request.id,ok:true,result})+'\n');
            if(request.operation==='close'){
              setTimeout(()=>server.close(()=>onClose?.()),50);
            }
          }catch(error){
            socket.write(JSON.stringify({id:request?.id||null,ok:false,error:String(error?.message||error)})+'\n');
          }
        })();
      }
    });
  });
  const timer=setTimeout(()=>server.close(()=>onClose?.()),SESSION_TTL_MS);
  timer.unref?.();
  server.on('close',()=>clearTimeout(timer));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(pipePath(config.pipeName),resolve);
  });
  return server;
}

class AdminDiagnosticsManager {
  constructor({execPath,appPath,isPackaged}={}) {
    this.execPath=execPath;
    this.appPath=appPath;
    this.isPackaged=Boolean(isPackaged);
    this.socket=null;
    this.buffer='';
    this.pending=new Map();
    this.seq=0;
    this.token='';
    this.pipeName='';
    this.expiresAt=0;
  }

  isActive(){
    return Boolean(this.socket && !this.socket.destroyed && Date.now()<this.expiresAt);
  }

  status(){
    return { active:this.isActive(), expiresAt:this.isActive()?this.expiresAt:null };
  }

  async start(){
    if(process.platform!=='win32') throw new Error('ADMIN_WINDOWS_ONLY');
    if(this.isActive()) return this.status();
    await this.stop().catch(()=>{});
    this.token=crypto.randomBytes(32).toString('hex');
    this.pipeName='jarvis-admin-'+crypto.randomBytes(18).toString('hex');
    const args=[
      ...(this.isPackaged?[]:[this.appPath]),
      '--jarvis-admin-helper',
      '--jarvis-admin-pipe='+this.pipeName,
      '--jarvis-admin-token='+this.token
    ];
    const argsPs='@('+args.map(psQuote).join(',')+')';
    const command=`Start-Process -FilePath ${psQuote(this.execPath)} -ArgumentList ${argsPs} -Verb RunAs -WindowStyle Hidden`;
    try {
      await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',command],{windowsHide:true,timeout:UAC_CONNECT_TIMEOUT_MS});
    } catch (error) {
      const detail=String(error?.stderr || error?.message || error || '');
      await this.stop().catch(()=>{});
      if (/cancel|canceled|cancelled|1223|operation was canceled/i.test(detail)) {
        throw new Error('ADMIN_UAC_CANCELLED');
      }
      throw new Error('ADMIN_UAC_LAUNCH_FAILED: '+detail.slice(0,600));
    }
    await this._connectWithRetry();
    this.expiresAt=Date.now()+SESSION_TTL_MS;
    const ping=await this.request('ping',{},8000);
    if(!ping?.identity?.Elevated){
      await this.stop().catch(()=>{});
      throw new Error('ADMIN_ELEVATION_NOT_GRANTED');
    }
    return { ...this.status(), identity:ping.identity };
  }

  async _connectWithRetry(){
    const deadline=Date.now()+UAC_CONNECT_TIMEOUT_MS;
    while(Date.now()<deadline){
      try{
        await new Promise((resolve,reject)=>{
          const socket=net.connect(pipePath(this.pipeName),()=>{
            this.socket=socket;
            this.buffer='';
            socket.setEncoding('utf8');
            socket.on('data',(chunk)=>this._onData(chunk));
            socket.on('close',()=>this._failAll('ADMIN_SESSION_CLOSED'));
            socket.on('error',()=>{});
            resolve();
          });
          socket.once('error',reject);
        });
        return;
      }catch{
        await new Promise((resolve)=>setTimeout(resolve,300));
      }
    }
    await this.stop().catch(()=>{});
    throw new Error('ADMIN_UAC_SESSION_TIMEOUT');
  }

  _onData(chunk){
    this.buffer+=chunk;
    let index;
    while((index=this.buffer.indexOf('\n'))>=0){
      const line=this.buffer.slice(0,index).trim();
      this.buffer=this.buffer.slice(index+1);
      if(!line) continue;
      let response;
      try{response=JSON.parse(line);}catch{continue;}
      const pending=this.pending.get(response.id);
      if(!pending) continue;
      this.pending.delete(response.id);
      clearTimeout(pending.timer);
      if(response.ok) pending.resolve(response.result);
      else pending.reject(new Error(response.error||'ADMIN_REQUEST_FAILED'));
    }
  }

  _failAll(message){
    for(const pending of this.pending.values()){
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.pending.clear();
    this.socket=null;
    this.expiresAt=0;
  }

  request(operation,payload={},timeout=30000){
    if(!this.isActive()) return Promise.reject(new Error('ADMIN_SESSION_NOT_ACTIVE'));
    const id=++this.seq;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        this.pending.delete(id);
        reject(new Error('ADMIN_REQUEST_TIMEOUT'));
      },timeout);
      this.pending.set(id,{resolve,reject,timer});
      this.socket.write(JSON.stringify({id,token:this.token,operation,payload})+'\n');
    });
  }

  async snapshot(){
    return this.request('snapshot',{},35000);
  }

  async stop(){
    if(this.isActive()){
      try{await this.request('close',{},3000);}catch{}
    }
    try{this.socket?.destroy();}catch{}
    this._failAll('ADMIN_SESSION_STOPPED');
    this.token='';
    this.pipeName='';
    return {active:false,expiresAt:null};
  }
}

module.exports={
  parseHelperArgs,
  startAdminHelper,
  AdminDiagnosticsManager,
  SESSION_TTL_MS,
  UAC_CONNECT_TIMEOUT_MS
};
