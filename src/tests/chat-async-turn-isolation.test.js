import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('src/pages/Chat.jsx','utf8');

function extract(name, start, end, context) {
  const a=source.indexOf(start);
  const b=source.indexOf(end,a);
  assert.ok(a>=0 && b>a, 'handler exists: '+name);
  // Only import.meta is renderer-only syntax. Substitute it for the isolated
  // Node VM; all other code comes from the current production Chat.jsx.
  const body=source.slice(a+start.length,b).replaceAll('import.meta.env?.DEV','false');
  return vm.runInNewContext('(async function '+name+'('+ (name==='sendMessage'?'overrideText':'') +') {'+body+'})',context);
}

function deferred() {
  let resolve,reject;
  const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}

function makeChatHarness({route,speech=false}={}) {
  const session={id:'old'};
  const conversationSaveSessionRef={current:session};
  let messages=[{role:'assistant',content:'old greeting'}];
  let loading=false,loadingStep='';
  const edits=[];
  const context={
    input:'old user question',
    loading:false,
    messages:[...messages],
    ctx:null,
    attachedImages:[],
    lang:'hu',
    detectedLang:'hu',
    userMood:'neutral',
    handsFree:false,
    conversationSaveSessionRef,
    voice:{state:{handsFree:false,autoSpeakReplies:speech}},
    t:()=> 'message',
    normalizeAssistantReply:value=>value,
    sanitizeAssistantText:value=>value,
    getWindowedMessages:value=>value,
    buildFileLabel:()=> '',
    handleSelfAuditCommand:async()=>null,
    jarvis:{auth:{me:async()=>({id:'owner'})}},
    setInput:()=>{},
    setAttachedImages:()=>{},
    setMessages:updater=>{messages=typeof updater==='function'?updater(messages):updater;edits.push(messages);},
    setLoading:value=>{loading=value;},
    setLoadingStep:value=>{loadingStep=value;},
    setDetectedLang:()=>{},
    setSystemState:()=>{},
    setCtx:()=>{},
    setPendingConfirm:()=>{},
    setDrivingMode:()=>{},
    setRouteWatch:()=>{},
    setShowNavModal:()=>{},
    sessionPersistence:{save:()=>{}},
    telemetry:{recordLatency:()=>{},recordFallback:()=>{}},
    selfHealingMonitor:{recordWorkerError:()=>{}},
    logger:{error:()=>{},warn:()=>{}},
    console:{error:()=>{},info:()=>{}},
    networkMonitor:{isOffline:()=>false,isOnline:()=>true},
    detectLanguage:async()=> 'hu',
    routeUserCommand:route|| (async()=>({intent:'assistant_turn',turn:{latencyMs:10,detectedLang:'hu'},reply:'response'})),
    getApprovalMode:()=> 'none',
    executeActions:async()=>[],
    loadFullContext:async()=>null,
    summarizeActionResults:()=> 'actions',
    speakReply:async()=>true,
    extractAndSaveMemory:async()=>{},
    getChatErrorMessage:()=> 'error',
    requestAnimationFrame:callback=>queueMicrotask(callback),
    setDegradedMode:()=>{},
  };
  const send=extract('sendMessage','const sendMessage = useCallback(async (overrideText) => {','\n  }, [input, loading, messages, ctx, attachedImages, lang, t, detectedLang, userMood, handsFree, speakReply, voice.state.handsFree]);',context);
  return {
    send,context,session,
    switchToNew:()=>{conversationSaveSessionRef.current={id:'new'};messages=[{role:'assistant',content:'NEW CHAT'}];loading=true;},
    get state(){return {messages,loading,loadingStep,edits};}
  };
}

async function until(predicate,limit=100) {
  for(let i=0;i<limit;i++){
    if(predicate())return;
    await new Promise(resolve=>setImmediate(resolve));
  }
  assert.fail('async handler did not reach expected point');
}

test('an old pending AI response never enters a newly selected conversation',async()=>{
  const gate=deferred();
  let routed=false;
  const h=makeChatHarness({route:async()=>{routed=true;return gate.promise;}});
  const pending=h.send();
  await until(()=>routed);
  h.switchToNew();
  gate.resolve({intent:'assistant_turn',turn:{latencyMs:10,detectedLang:'hu'},reply:'OLD AI ANSWER'});
  await pending;
  assert.deepEqual(h.state.messages,[{role:'assistant',content:'NEW CHAT'}]);
  assert.equal(h.state.loading,true,'old turn must not reset new turn spinner');
});

test('an obsolete AI error cannot overwrite the new conversation',async()=>{
  const gate=deferred();
  let routed=false;
  const h=makeChatHarness({route:async()=>{routed=true;return gate.promise;}});
  const pending=h.send();
  await until(()=>routed);
  h.switchToNew();
  gate.reject(new Error('old network error'));
  await pending;
  assert.deepEqual(h.state.messages,[{role:'assistant',content:'NEW CHAT'}]);
  assert.equal(h.state.loading,true);
});

test('an ordinary completed AI turn still renders its answer and releases spinner',async()=>{
  const h=makeChatHarness();
  await h.send();
  assert.equal(h.state.messages.at(-1).content,'response');
  assert.equal(h.state.loading,false);
  assert.equal(h.state.loadingStep,'');
});

test('a delayed self-audit reply is discarded after switching chat',async()=>{
  const gate=deferred();
  const h=makeChatHarness();
  h.context.handleSelfAuditCommand=()=>gate.promise;
  const pending=h.send();
  h.switchToNew();
  gate.resolve({handled:true,reply:'OLD AUDIT'});
  await pending;
  assert.deepEqual(h.state.messages,[{role:'assistant',content:'NEW CHAT'}]);
});

test('confirmation results use the originating conversation session',async()=>{
  const gate=deferred();
  const session={id:'original'};
  const ref={current:session};
  let messages=[{role:'assistant',content:'before'}], loading=false;
  const context={
    conversationSaveSessionRef:ref,
    pendingConfirm:{actions:[{tool:'example'}],goal:'test',lang:'hu',preapprovedTools:[]},
    detectedLang:'hu',lang:'hu',
    setLoading:x=>{loading=x;},
    setLoadingStep:()=>{},
    setMessages:fn=>{messages=typeof fn==='function'?fn(messages):fn;},
    setPendingConfirm:()=>{},
    loadFullContext:async()=>null,
    setCtx:()=>{},
    executeActions:()=>gate.promise,
    runWorkflow:()=>gate.promise,
    summarizeActionResults:()=> 'completed',
  };
  const confirm=extract('confirmAndExecute','const confirmAndExecute = async () => {','\n  };\n\n  const exportChatToPDF = () => {',context);
  const pending=confirm();
  ref.current={id:'new'};
  messages=[{role:'assistant',content:'new chat'}];
  loading=true;
  gate.resolve([{success:true}]);
  await pending;
  assert.deepEqual(messages,[{role:'assistant',content:'new chat'}]);
  assert.equal(loading,true);
});
