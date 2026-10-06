import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { sanitizeAssistantText, SAFE_ASSISTANT_FALLBACK } from '../lib/assistantResponseHandler.js';
import { enqueueOfflineAction, getOfflineQueue } from '../lib/offlineActionQueue.js';
import { normalizeConversationMessages, mergeConversationMessages } from '../lib/conversationMessages.js';
const require = createRequire(import.meta.url);
const { LocalDatabase } = require('../../electron/data/local-database.cjs');
const { snapshotRuntime, restoreRuntime } = require('../../electron/runtime-activation.cjs');
function source(file) { return fs.readFileSync(file, 'utf8'); }
function load(file, context) {
  const code = source(file).replace(/^import .*;\n/gm, '').replace(/export /g, '');
  return vm.runInNewContext(code, context);
}
function deferred() { let resolve; const promise = new Promise(r => { resolve=r; }); return { promise, resolve }; }
const tick = () => new Promise(resolve => setImmediate(resolve));

test('offline queue preserves all 150 pending actions in order', () => {
  const old = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = { getItem:key=>values.get(key), setItem:(key,val)=>values.set(key,val) };
  try {
    for (let i=0;i<150;i++) enqueueOfflineAction({ type:i===0?'route_start':'route_update', local_id:'route', payload:{ index:i } });
    assert.deepEqual(getOfflineQueue().map(item=>item.payload.index), Array.from({length:150},(_,i)=>i));
  } finally { globalThis.localStorage=old; }
});

test('private device URLs reject lookalike domains and accept IPv6 literals', () => {
  const main=source('electron/main.cjs');
  const fn=main.slice(main.indexOf('function buildLocalDeviceUrl('),main.indexOf('async function requestLocalDevice('));
  const build=vm.runInNewContext(fn+';buildLocalDeviceUrl',{require,URL});
  for(const host of ['10.example.com','fc-example.com','8.8.8.8','[2001:4860:4860::8888]']) {
    assert.throws(()=>build('http://'+host),/HOST_BLOCKED/);
  }
  for(const host of ['localhost','127.0.0.1','10.0.0.1','172.31.0.1','192.168.1.2','[::1]','[fd00::1]','[fe80::1]']) {
    assert.ok(build('http://'+host));
  }
  assert.throws(()=>build('http://user:pass@localhost'),/CREDENTIALS_BLOCKED/);
});

test('legitimate JSON and code are preserved while internal actions are removed', () => {
  for(const text of ['```json\n{"nev":"George"}\n```','{"action":"go"}','```javascript\nconst params = {x:1};\n```']) {
    assert.equal(sanitizeAssistantText(text),text);
  }
  const toolLikeExample = '{"tool":"create_note","params":{"title":"x"}}';
  assert.equal(sanitizeAssistantText(toolLikeExample),toolLikeExample);
  assert.equal(sanitizeAssistantText(toolLikeExample,SAFE_ASSISTANT_FALLBACK,{internalPayload:true}),SAFE_ASSISTANT_FALLBACK);
  assert.equal(sanitizeAssistantText('Kész.\n```actions\n[{"tool":"create_note","params":{}}]\n```'),'Kész.');
});

test('database search applies the result limit after matching', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-search-'));
  const db=new LocalDatabase(path.join(root,'data.sqlite'));
  try {
    const target=db.create('Note',{title:'régi keresett jegyzet'});
    for(let i=0;i<10;i++) db.create('Note',{title:'új jegyzet '+i});
    assert.equal(db.search('Note',{},'keresett',1)[0]?.id,target.id);
  } finally { db.close(); fs.rmSync(root,{recursive:true,force:true}); }
});

function voiceHarness({getUserMedia,settings}={}) {
  let latestAudio, calls=0;
  class Audio {
    constructor() { latestAudio=this; }
    play() { return Promise.resolve(); }
    pause() {}
  }
  const context={ Blob,performance,Audio, console:{info(){}},
    window:{setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},MediaRecorder:true,
      jarvisDesktop:{capabilities:{recordedStt:true},getSettings:async()=>settings?.() ?? {ttsVoice:'A',ttsModel:'M'}}},
    navigator:{onLine:true,mediaDevices:{getUserMedia}},
    jarvis:{functions:{invoke:async()=>{ calls++;return {data:{audioBase64:'AAAA',mimeType:'audio/mpeg'}}; }}},
    hasLiveAudioTrack:stream=>stream?.getAudioTracks().some(track=>track.readyState==='live'),
    microphoneErrorMessage:error=>error.message, startLipSyncFromAudioElement(){},stopLipSync(){}
  };
  load('src/lib/mobileVoiceIO.js',context);
  return {io:context.createRecordedVoiceIO({}),get audio(){return latestAudio;},get calls(){return calls;}};
}

test('cancelling TTS settles playback and does not block a subsequent reply',async()=>{
  const h=voiceHarness();
  const first=h.io.speakText('Cancel test.', 'hu', {resumeAfter:false});
  await tick(); assert.ok(h.audio);
  h.io.cancelTTS(); assert.equal(await first,false);
  const second=h.io.speakText('Another reply.', 'hu', {resumeAfter:false});
  await tick(); h.audio.onended(); assert.equal(await second,true);
});

test('changing the TTS voice invalidates cached audio',async()=>{
  let voice='A';const h=voiceHarness({settings:()=>({ttsVoice:voice,ttsModel:'M'})});
  let promise=h.io.speakText('Same phrase.', 'hu', {resumeAfter:false});
  await tick();h.audio.onended();assert.equal(await promise,true);
  const count=h.calls;voice='B';
  promise=h.io.speakText('Same phrase.', 'hu', {resumeAfter:false});
  await tick();h.audio.onended();await promise;assert.equal(h.calls,count+1);
});

test('a late microphone permission grant after stop closes the stream',async()=>{
  const pending=deferred();let stopped=0;
  const track={readyState:'live',stop(){stopped++;this.readyState='ended';},addEventListener(){}};
  const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
  const h=voiceHarness({getUserMedia:()=>pending.promise});
  const started=h.io.startContinuous();h.io.stopContinuous();pending.resolve(stream);
  assert.equal(await started,false);assert.equal(stopped,1);
});

test('a failed repair restores both compiled renderer and activation bytes',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-runtime-'));
  const workspace=path.join(root,'workspace');const state=path.join(root,'runtime.json');const backup=path.join(root,'backup');
  fs.mkdirSync(path.join(workspace,'dist'),{recursive:true});
  fs.writeFileSync(path.join(workspace,'dist','index.html'),'previous renderer');
  fs.writeFileSync(state,'{"enabled":true,"version":"previous"}');
  try {
    const saved=snapshotRuntime(workspace,state,backup);
    fs.writeFileSync(path.join(workspace,'dist','index.html'),'broken renderer');fs.rmSync(state);
    restoreRuntime(workspace,state,saved);
    assert.equal(fs.readFileSync(path.join(workspace,'dist','index.html'),'utf8'),'previous renderer');
    assert.equal(fs.readFileSync(state,'utf8'),'{"enabled":true,"version":"previous"}');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('comma decimals persist correctly and nonfinite amounts do not write records',async()=>{
  const writes=[];
  const entities=new Proxy({}, {get:(_target,entity)=>({create:async data=>{writes.push({entity,data});return data;}})});
  const context={jarvis:{auth:{me:async()=>({email:'owner@test'})},entities},logger:{warn(){}},ENV_TOOLS:{},syncDiscoveredTools(){},localDateKey:()=> '2026-09-30'};
  const tools=vm.runInNewContext(source('src/lib/assistantTools.js').replace(/^import .*;\n/gm,'').replace(/export /g,'')+';TOOLS',context);
  await tools.log_blood_sugar({value:'6,7'});
  await tools.log_finance({description:'teszt',amount:'12,99'});
  assert.equal(writes.find(write=>write.entity==='BloodSugar').data.value,6.7);
  assert.equal(writes.find(write=>write.entity==='FinanceEntry').data.amount,12.99);
  const before=writes.length;
  await assert.rejects(()=>tools.log_finance({description:'teszt',amount:Infinity}),/Érvénytelen szám/);
  await assert.rejects(()=>tools.log_finance({description:'teszt',amount:'12junk'}),/Érvénytelen szám/);
  assert.equal(writes.length,before);
});

test('memory extraction unwraps the real gateway envelope before saving',async()=>{
  const chat=source('src/pages/Chat.jsx');const start=chat.indexOf('  const extractAndSaveMemory = useCallback(');
  const end=chat.indexOf('  const handleVoiceCall',start);let saved;
  const extract=vm.runInNewContext(chat.slice(start,end)+';extractAndSaveMemory',{
    useCallback:fn=>fn,invokeWithRetry:async()=>({success:true,data:{result:{save:true,content:'George Mirfieldben él.',category:'fact'}}}),
    TOOLS:{save_memory:async data=>{saved=data;}}
  });
  await extract('Mirfieldben élek.',[]);assert.equal(saved?.content,'George Mirfieldben él.');
});

test('invalid device commands cannot send a physical OFF request',async()=>{
  let sent=0;
  const context={jarvis:{auth:{me:async()=>({email:'owner@test'})},entities:{}},window:{jarvisDesktop:{localDeviceRequest:async()=>{sent++;}}}};
  const tools=vm.runInNewContext(source('src/lib/environmentTools.js').replace(/^import .*;\n/gm,'').replace(/export /g,'')+';ENV_TOOLS',context);
  assert.equal((await tools.control_device({device_name:'lámpa',command:'toggle'})).success,false);
  assert.equal(sent,0);
});

test('failed scene and unsupported routine steps cannot report success',async()=>{
  let updates=0;const logs=[];const owner='owner@test';
  const context={jarvis:{auth:{me:async()=>({email:owner})},entities:{
    Scene:{filter:async()=>[{id:'scene',name:'Este',created_by:owner,actions:[{type:'device',device:'lámpa',command:'off'}]}],update:async()=>{updates++;}},
    Routine:{filter:async()=>[{id:'routine',name:'Reggel',created_by:owner,steps:[{tool:'unknown',params:{}}]}],update:async()=>{updates++;}},
    SmartDevice:{filter:async()=>[]},ActionLog:{create:async data=>logs.push(data)}
  }},window:{}};
  const tools=vm.runInNewContext(source('src/lib/environmentTools.js').replace(/^import .*;\n/gm,'').replace(/export /g,'')+';ENV_TOOLS',context);
  assert.equal((await tools.trigger_scene({scene_name:'Este'})).success,false);
  assert.equal((await tools.run_routine({routine_name:'Reggel'})).success,false);
  assert.equal(updates,0);assert.ok(logs.every(log=>log.status==='failed'));
});

test('online auto-sync retries a failed snapshot without a reconnect event and cleans its timer',async()=>{
  const rules=await import('../lib/offlineSyncRules.js');let now=100000,attempts=0,timer,cleared=false;
  let queue=[{id:'snapshot',revision:1,type:'conversation_snapshot',status:'pending',payload:{messages:[{role:'user',content:'Hello'}],metadata:{offlineChatId:'chat'}}}];
  class Clock extends Date { static now(){return now;} }
  const context={ Date:Clock,queueMicrotask,MAX_SYNC_RETRIES:rules.MAX_SYNC_RETRIES,getRetryDelayMs:rules.getRetryDelayMs,isReadyForRetry:rules.isReadyForRetry,
    normalizeConversationMessages,mergeConversationMessages,
    setInterval:fn=>{timer=fn;return 1;},clearInterval:()=>{cleared=true;},
    networkMonitor:{isOnline:()=>true,subscribe:()=>()=>{}},logger:{warn(){}},
    listSyncActions:async()=>structuredClone(queue),
    mutateSyncActionIfUnchanged:async(item,patch)=>{
      if(!queue.some(row=>row.id===item.id&&row.revision===item.revision))return false;
      if(patch)queue=queue.map(row=>row.id===item.id?{...row,...patch}:row);else queue=[];
      return true;
    },
    jarvis:{auth:{me:async()=>({email:'owner@test'})},entities:{Conversation:{filter:async()=>[],create:async()=>{if(++attempts===1)throw new Error('temporary failure');return {id:'saved'};}}}}
  };
  load('src/lib/offlineSyncManager.js',context);
  const stop=context.startOfflineAutoSync();await tick();await tick();
  assert.equal(attempts,1);assert.equal(queue[0]?.status,'failed');
  now+=30000;timer();await tick();await tick();
  assert.equal(attempts,2);assert.equal(queue.length,0);
  stop();assert.equal(cleared,true);
});

test('automotive report creates a real paginated PDF with the embedded Hungarian font',async()=>{
  const context={jsPDF:require('jspdf').jsPDF,fontUrl:'test-font',btoa,
    fetch:async()=>({ok:true,arrayBuffer:async()=>{
      const bytes=fs.readFileSync('src/assets/fonts/DejaVuSans.ttf');
      return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    }})
  };
  load('src/lib/automotivePdf.js',context);
  const pdf=await context.createAutomotivePdf({diagnosis:'Árvíztűrő tükörfúrógép. '.repeat(500),dtcCodes:['P0100'],parts:[],vehicleProfile:{manufacturer:'Teszt'},estimatedCost:'100 £'});
  assert.ok(pdf.getNumberOfPages()>1);
  assert.equal(Buffer.from(pdf.output('arraybuffer')).subarray(0,5).toString(),'%PDF-');
});

test('a stale microphone request cannot stop a newly started capture',async()=>{
  const first=deferred(),second=deferred();let calls=0;
  const makeStream=()=>{const track={readyState:'live',stop(){this.readyState='ended';},addEventListener(){}};return {track,getTracks:()=>[track],getAudioTracks:()=>[track]};};
  const oldStream=makeStream(),newStream=makeStream();
  const h=voiceHarness({getUserMedia:()=>++calls===1?first.promise:second.promise});
  const oldStart=h.io.startContinuous();h.io.stopContinuous();
  const newStart=h.io.startContinuous();second.resolve(newStream);assert.equal(await newStart,true);
  first.resolve(oldStream);assert.equal(await oldStart,false);
  assert.equal(oldStream.track.readyState,'ended');assert.equal(newStream.track.readyState,'live');
  h.io.stopContinuous();assert.equal(newStream.track.readyState,'ended');
});

test('reminders wait for their due time and previously shown reminders do not block new ones',async()=>{
  const now=new Date('2026-09-30T09:00:00').getTime();class Clock extends Date {static now(){return now;}}
  const notifications=[];
  class Notification {static permission='granted';constructor(_title,options){notifications.push(options.tag);}}
  let stored=JSON.stringify(Array.from({length:4},(_,i)=>({tag:'reminder:old'+i,ts:now})));
  const reminders=[...Array.from({length:4},(_,i)=>({id:'old'+i,due_date:'2026-09-30',due_time:'08:00'})),
    {id:'due',title:'Esedékes',due_date:'2026-09-30',due_time:'08:59'},
    {id:'future',title:'Később',due_date:'2026-09-30',due_time:'10:00'}];
  const context={Date:Clock,Notification,window:{Notification},localStorage:{getItem:()=>stored,setItem:(_key,value)=>{stored=value;}},
    setInterval:()=>1,clearInterval(){},document:{addEventListener(){},removeEventListener(){}},
    useRef:value=>({current:value}),useEffect:fn=>fn(),localDateKey:()=> '2026-09-30',logger:{warn(){}},
    CONFIG:{NOTIF_MIN_INTERVAL:30000,NOTIF_TTL:86400000,NOTIF_MAX_STORED:100,NOTIF_BACKOFF_FACTOR:2,NOTIF_MAX_INTERVAL:3600000},
    jarvis:{auth:{me:async()=>({id:'owner',email:'owner@test'})},entities:{Reminder:{filter:async()=>reminders},TodoItem:{filter:async()=>[]}}}
  };
  const code=source('src/components/jarvis/PushNotificationManager.jsx').replace(/^import .*;\n/gm,'').replace('export default ','');
  vm.runInNewContext(code+';PushNotificationManager()',context);await tick();await tick();
  assert.deepEqual(notifications,['reminder:due']);
});
