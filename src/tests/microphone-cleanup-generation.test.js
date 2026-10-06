import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{
  let resolve;
  const promise=new Promise(res=>{resolve=res;});
  return {promise,resolve};
};

function harness({firstRecorderFails=false,firstTrackEnded=false,onError}={}) {
  const closeFirst=deferred();
  const streams=[];
  const recorders=[];
  const states=[];
  const errors=[];
  const timers=[];
  let contextCount=0;
  let recorderAttempts=0;
  class AudioContext {
    constructor(){this.number=++contextCount;}
    async resume(){}
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    createAnalyser(){return {fftSize:1024,getByteTimeDomainData(){}};}
    close(){return this.number===1 ? closeFirst.promise : Promise.resolve();}
  }
  class MediaRecorder {
    static isTypeSupported(){return true;}
    constructor(){
      if (++recorderAttempts===1 && firstRecorderFails) throw new Error('RECORDER_CREATE_FAILED');
      this.state='inactive';
      recorders.push(this);
    }
    start(){this.state='recording';}
    stop(){this.state='inactive';}
  }
  const context={
    Blob,performance,Uint8Array,MediaRecorder,
    console:{info(){}},
    window:{
      AudioContext,MediaRecorder,
      setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){},
      setInterval(){return 1;},clearInterval(){},
      jarvisDesktop:{capabilities:{recordedStt:true}},
    },
    navigator:{onLine:true,mediaDevices:{getUserMedia:async()=>{
      const track={readyState:streams.length===0 && firstTrackEnded ? 'ended' : 'live',
        stop(){this.readyState='ended';},addEventListener(){}};
      const stream={track,getTracks:()=>[track],getAudioTracks:()=>[track]};
      streams.push(stream);
      return stream;
    }}},
    jarvis:{functions:{invoke:async()=>({data:{text:''}})}},
    computeSpeechThreshold:()=>0.02,
    hasLiveAudioTrack:stream=>!!stream?.getAudioTracks?.().some(track=>track.readyState==='live'),
    isLikelySilenceTranscript:()=>false,microphoneErrorMessage:error=>error.message,
    updateNoiseFloor:value=>value,startLipSyncFromAudioElement(){},stopLipSync(){},
  };
  const code=fs.readFileSync('src/lib/mobileVoiceIO.js','utf8')
    .replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const create=vm.runInNewContext(code+';createRecordedVoiceIO',context);
  const io=create({onStateChange:state=>states.push(state),onError:error=>{errors.push(error);onError?.(io,error);}});
  return {io,closeFirst,streams,recorders,states,errors,timers};
}

test('late recorder-failure cleanup cannot report an error over a newer live recording',async()=>{
  const h=harness({firstRecorderFails:true});
  assert.equal(await h.io.startContinuous(),true);
  const oldSegment=h.timers.shift()();
  await tick();
  assert.equal(h.streams[0].track.readyState,'ended');
  assert.equal(await h.io.startContinuous(),true);
  await h.timers.shift()();
  assert.equal(h.recorders.at(-1).state,'recording');
  assert.equal(h.states.at(-1).phase,'listening');
  h.closeFirst.resolve();
  await oldSegment;
  assert.equal(h.streams.at(-1).track.readyState,'live');
  assert.equal(h.states.at(-1).phase,'listening');
  assert.equal(h.errors.length,0);
  h.io.stopContinuous();
});

test('late startContinuous cleanup cannot report an obsolete microphone error',async()=>{
  const h=harness({firstTrackEnded:true});
  const oldStart=h.io.startContinuous();
  await tick();
  assert.equal(await h.io.startContinuous(),true);
  await h.timers.shift()();
  h.closeFirst.resolve();
  assert.equal(await oldStart,false);
  assert.equal(h.errors.length,0);
  assert.equal(h.states.at(-1).phase,'listening');
  assert.equal(h.streams.at(-1).track.readyState,'live');
  h.io.stopContinuous();
});

test('a delayed dead-stream restart yields to a newer capture',async()=>{
  const h=harness();
  await h.io.startContinuous();
  await h.timers.shift()();
  h.streams[0].track.readyState='ended';
  const oldRestart=h.io.startContinuous();
  await tick();
  assert.equal(await h.io.startContinuous(),true);
  await h.timers.shift()();
  h.closeFirst.resolve();
  assert.equal(await oldRestart,false);
  assert.equal(h.streams.length,2,'old cleanup must not acquire a third stream');
  assert.equal(h.streams.at(-1).track.readyState,'live');
  assert.equal(h.states.at(-1).phase,'listening');
  h.io.stopContinuous();
});

test('current recorder failure still reports its error after cleanup completes',async()=>{
  const h=harness({firstRecorderFails:true});
  await h.io.startContinuous();
  const pending=h.timers.shift()();
  await tick();
  h.closeFirst.resolve();
  await pending;
  assert.equal(h.errors[0].type,'microphone_denied');
  assert.equal(h.states.at(-1).phase,'error');
  assert.equal(h.streams[0].track.readyState,'ended');
  h.io.stopContinuous();
});

test('an error callback that restarts capture cannot receive a subsequent stale error state',async()=>{
  let restarted;
  const h=harness({firstRecorderFails:true,onError:io=>{restarted=io.startContinuous();}});
  await h.io.startContinuous();
  const pending=h.timers.shift()();
  await tick();
  h.closeFirst.resolve();
  await pending;
  assert.equal(await restarted,true);
  await h.timers.shift()();
  assert.equal(h.errors.length,1);
  assert.equal(h.states.some(state=>state.phase==='error'),false);
  assert.equal(h.states.at(-1).phase,'listening');
  assert.equal(h.streams.at(-1).track.readyState,'live');
  h.io.stopContinuous();
});
