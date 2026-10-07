import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(res=>{resolve=res;});return {promise,resolve};}

function harness({mode='browser',recordedSpeak}={}){
  const source=fs.readFileSync('src/lib/voiceRuntime.js','utf8');
  const start=source.indexOf('  _cancelTTS() {');
  const end=source.indexOf('  getState()',start);
  const warmStart=source.indexOf('  _warmupTTS() {');
  const warmEnd=source.indexOf('// ──',warmStart);
  const spoken=[];
  const timers=[];
  let cancels=0;
  const window={
    speechSynthesis:{getVoices:()=>[],speak:value=>spoken.push(value),cancel:()=>{cancels+=1;}},
    setTimeout:(fn,delay)=>{const timer={fn,delay,cleared:false};timers.push(timer);return timer;},
  };
  const runtime=vm.runInNewContext('new (class {'+source.slice(start,end)+source.slice(warmStart,warmEnd)+'})()',{
    window,setTimeout:window.setTimeout,clearTimeout:timer=>{timer.cleared=true;},
    SpeechSynthesisUtterance:class {constructor(text){this.text=text;}},
    canUseBrowserTTS:()=>true,sanitizeForSpeech:value=>value,
    VOICE_PHASE:{IDLE:'IDLE',SPEAKING:'SPEAKING'},HANDS_FREE_RESTART_DELAY_MS:180,
    logger:{warn(){},debug(){}},MODULE:'voice',devVoiceLog(){},
    performance,console:{info(){}},getVoicePreferences:()=>({}),chooseVoice:()=>null,
  });
  Object.assign(runtime,{
    state:{voiceInputMode:mode,handsFree:false,recognitionLang:'hu-HU'},
    ttsGenerationRef:0,ttsFinishRef:null,ttsInFlightRef:false,voicesLoadedRef:true,
    _stopRecognition(){},_canRestartRecognition:()=>false,
    _updateState(value){Object.assign(this.state,value);},
    recordedVoiceRef:{pauseCapture(){},cancelTTS(){},speakText:recordedSpeak||(()=>Promise.resolve(true))},
  });
  return {runtime,spoken,timers,get cancels(){return cancels;}};
}

test('browser TTS cancellation settles the original promise and suppresses delayed chunks',async()=>{
  const h=harness();
  let settled=false;
  const pending=h.runtime.speakText('First. Second.').then(value=>{settled=true;return value;});
  h.spoken[0].onend();
  h.runtime._cancelTTS();
  await tick();
  assert.equal(settled,true);
  assert.equal(await pending,false);
  for(const timer of h.timers.filter(timer=>timer.delay===120))timer.fn();
  assert.equal(h.spoken.length,1);
});

test('late browser callbacks cannot reset or advance a newer utterance',async()=>{
  const h=harness();
  const old=h.runtime.speakText('Old reply.');
  const oldUtterance=h.spoken[0];
  h.runtime._cancelTTS();
  const next=h.runtime.speakText('New reply.');
  const current=h.spoken.at(-1);
  current.onstart();
  oldUtterance.onstart?.();
  oldUtterance.onerror?.();
  assert.equal(h.runtime.ttsInFlightRef,true);
  assert.equal(h.runtime.ttsUtteranceRef,current);
  h.runtime._cancelTTS();
  assert.deepEqual(await Promise.all([old,next]),[false,false]);
});

test('late recorded TTS completion cannot release a newer speech operation',async()=>{
  const oldAudio=deferred(),newAudio=deferred();
  let calls=0;
  const h=harness({mode:'recorded',recordedSpeak:()=>++calls===1 ? oldAudio.promise : newAudio.promise});
  const first=h.runtime.speakText('old');
  await tick();
  h.runtime._cancelTTS();
  const second=h.runtime.speakText('new');
  await tick();
  oldAudio.resolve(false);
  await first;
  assert.equal(h.runtime.ttsInFlightRef,true);
  assert.equal(h.runtime.state.machineState,'SPEAKING');
  newAudio.resolve(true);
  assert.equal(await second,true);
});

test('warmup timer cannot cancel a real reply that started afterwards',async()=>{
  const h=harness();
  h.runtime._warmupTTS();
  const pending=h.runtime.speakText('Actual reply.');
  const cancellations=h.cancels;
  h.timers.find(timer=>timer.delay===50).fn();
  assert.equal(h.cancels,cancellations);
  h.runtime._cancelTTS();
  await pending;
});

test('pausing an already draining transcript queue retains the remaining commands',async()=>{
  const source=fs.readFileSync('src/lib/transcriptQueue.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const Queue=vm.runInNewContext(source+';TranscriptQueue',{
    CONFIG:{QUEUE_MAX_SIZE:10,QUEUE_DEBOUNCE_MS:0},Date,queueMicrotask,setTimeout,
    logger:{warn(){},error(){}},telemetry:{recordLatency(){},recordWorkerError(){},recordQueueOverflow(){}},
  });
  const queue=new Queue();
  const gate=deferred();
  const handled=[];
  queue.setHandler(async text=>{handled.push(text);if(text==='first')await gate.promise;});
  queue.push('first');
  await tick();
  queue.push('second');
  queue.push('third');
  queue.pause();
  gate.resolve();
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.deepEqual(handled,['first']);
  assert.equal(queue.size,2);
  queue.resume();
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.deepEqual(handled,['first','second','third']);
});
