import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeConversationMessages, mergeConversationMessages } from '../lib/conversationMessages.js';

const syncSource = fs.readFileSync('src/lib/offlineSyncManager.js','utf8');
const storeSource = fs.readFileSync('src/lib/indexedDbOfflineStore.js','utf8');

function actualSyncFunction(records) {
  const start = syncSource.indexOf('async function syncConversationSnapshot(');
  const end = syncSource.indexOf('export async function syncOfflineData(',start);
  assert.ok(start>=0 && end>start,'source function exists');
  const jarvis = { entities:{ Conversation:{
    async get(id) { return records.find(row=>row.id===id) || null; },
    async filter(query) {
      return records.filter(row => Object.entries(query).every(([k,v])=>row[k]===v));
    },
    async create(value) {
      const row = {...value,id:'record-'+(records.length+1)};
      records.push(row);
      return row;
    },
    async update(id,patch) {
      const existing=records.find(row=>row.id===id);
      assert.ok(existing,'existing record');
      Object.assign(existing,patch);
      return existing;
    }
  }} };
  return vm.runInNewContext(syncSource.slice(start,end)+'; syncConversationSnapshot',
    {jarvis,Date,normalizeConversationMessages,mergeConversationMessages});
}

function actualQueueFunction(entries) {
  const start=storeSource.indexOf('export async function queueConversationSync(');
  const end=storeSource.indexOf('export async function listSyncActions(',start);
  assert.ok(start>=0&&end>start,'queue function exists');
  const code=storeSource.slice(start,end).replace(/^export\s+/,'');
  return vm.runInNewContext(code+'; queueConversationSync', {
    saveChatSnapshot: async (messages,metadata)=>({id:'active_chat',messages,metadata}),
    enqueueSyncAction: async (entry)=>{entries.set(entry.id,entry);return entry;}
  });
}

test('two conversations with identical titles keep distinct offline queue entries',async()=>{
  const entries=new Map();
  const queue=actualQueueFunction(entries);
  await queue([{role:'user',content:'same title'}],{offlineChatId:'chat-a'});
  await queue([{role:'user',content:'same title'}],{offlineChatId:'chat-b'});
  assert.equal(entries.size,2);
  assert.ok(entries.has('conversation_snapshot_chat-a'));
  assert.ok(entries.has('conversation_snapshot_chat-b'));
  await queue([{role:'user',content:'same title'},{role:'assistant',content:'new reply'}],{offlineChatId:'chat-a'});
  assert.equal(entries.size,2,'same chat is coalesced');
  assert.equal(entries.get('conversation_snapshot_chat-a').payload.messages.length,2);
});

test('recovery upserts using chat ID rather than title and appears in ordinary history',async()=>{
  const records=[];
  const sync=actualSyncFunction(records);
  const item=(id,content)=>({
    id:'conversation_snapshot_'+id,
    payload:{title:'Mobil beszélgetés',metadata:{offlineChatId:id},
      messages:[{role:'user',content,timestamp:'2026-09-30T10:00:00.000Z'}]}
  });
  await sync(item('chat-a','identical title'),{email:'owner@jarvis.local'});
  await sync(item('chat-b','identical title'),{email:'owner@jarvis.local'});
  assert.equal(records.length,2,'different conversation IDs must never overwrite');
  assert.equal(records[0].source,'chat');
  assert.equal(records[1].source,'chat');
  assert.notEqual(records[0].offline_sync_id,records[1].offline_sync_id);
  // A divergent snapshot may NOT overwrite the already persisted chat.
  await assert.rejects(
    ()=>sync(item('chat-a','different first message'),{email:'owner@jarvis.local'}),
    /OFFLINE_SYNC_CONVERSATION_CONFLICT/
  );
  assert.equal(records.length,2,'conflict retains both original records');
  assert.equal(records[0].messages[0].content,'identical title');
  assert.equal(records[1].messages[0].content,'identical title');
  const extended=item('chat-a','identical title');
  extended.payload.messages.push({role:'assistant',content:'new offline reply'});
  await sync(extended,{email:'owner@jarvis.local'});
  assert.equal(records.length,2,'continuation updates same record');
  assert.equal(records[0].messages.length,2);
  assert.equal(records[0].messages[1].content,'new offline reply');
  // A stale shorter snapshot must never truncate a longer chat.
  await sync(item('chat-a','identical title'),{email:'owner@jarvis.local'});
  assert.equal(records[0].messages.length,2);
});

test('offline recovery preserves complete message content',async()=>{
  const records=[];
  const sync=actualSyncFunction(records);
  const text='Á'.repeat(8000);
  await sync({id:'snapshot-one',
    payload:{metadata:{offlineChatId:'long-chat'},
      messages:[{role:'user',content:'prompt'},{role:'assistant',content:text}]}},
    {email:'owner@jarvis.local'});
  assert.equal(records.length,1);
  assert.equal(records[0].messages[1].content,text);
});

test('greeting-only snapshot does not create spurious history',async()=>{
  const records=[];
  const sync=actualSyncFunction(records);
  await sync({id:'snapshot-two',
    payload:{metadata:{offlineChatId:'empty'},
      messages:[{role:'assistant',content:'Hello'}]}},
    {email:'owner@jarvis.local'});
  assert.equal(records.length,0);
});

test('Chat assigns stable offline IDs when opening, restoring or starting chats',()=>{
  const chat=fs.readFileSync('src/pages/Chat.jsx','utf8');
  assert.match(chat,/const offlineChatIdRef = useRef\(crypto\.randomUUID\(\)\)/);
  assert.match(chat,/offlineChatIdRef\.current = conversation\.id/);
  assert.match(chat,/offlineChatIdRef\.current = activeConversation\.id/);
  assert.match(chat,/offlineChatId:offlineChatIdRef\.current/g);
});

test('a linked local conversation is recovered without creating duplicates',async()=>{
  const records=[{
    id:'original-id',title:'Original chat',source:'chat',
    messages:[
      {role:'user',content:'first',actionResults:[{ok:true}]},
      {role:'assistant',content:'latest reply'}
    ],
    metadata:{lastSavedAt:'2026-09-30T11:00:00Z'}
  }];
  const sync=actualSyncFunction(records);
  await sync({
    id:'conversation_snapshot_local',
    payload:{
      metadata:{offlineChatId:'offline-local',conversationId:'original-id'},
      messages:[{role:'user',content:'first'}]
    }
  },{email:'owner@jarvis.local'});
  assert.equal(records.length,1,'a linked history cannot be duplicated');
  assert.equal(records[0].messages.length,2,'stale snapshot cannot truncate newer replies');
  assert.equal(records[0].messages[0].actionResults[0].ok,true,'richer local message data remains');
});

test('a valid longer offline continuation preserves existing action results',async()=>{
  const records=[{
    id:'existing',source:'chat',offline_sync_id:'session',
    messages:[{role:'user',content:'first',actionResults:[{ok:true}]}],
    metadata:{detectedLang:'hu'}
  }];
  const sync=actualSyncFunction(records);
  await sync({
    id:'conversation_snapshot_session',
    payload:{
      metadata:{offlineChatId:'session'},
      messages:[
        {role:'user',content:'first'},
        {role:'assistant',content:'offline answer'}
      ]
    }
  },{email:'owner@jarvis.local'});
  assert.equal(records.length,1);
  assert.equal(records[0].messages[0].actionResults[0].ok,true);
  assert.equal(records[0].messages[1].content,'offline answer');
});

test('ordinary online saves also include the offline chat identity',()=>{
  const history=fs.readFileSync('src/lib/conversationHistory.js','utf8');
  const chat=fs.readFileSync('src/pages/Chat.jsx','utf8');
  assert.match(history,/offline_sync_id:String\(metadata\.offlineChatId\)/);
  assert.match(chat,/saveConversationHistory,\s*\(savedId, savedSession\)/);
  assert.match(chat,/offlineChatId:offlineChatIdRef\.current/);
});

test('real recovery preserves attachment metadata, bounded results and message IDs',async()=>{
  const records=[];
  const sync=actualSyncFunction(records);
  const messages=[
    {id:'user-one',role:'user',content:'Check my archive',attachedFiles:[{name:'project.zip',kind:'archive',size:400,url:'data:secret'}]},
    {id:'reply-one',role:'assistant',content:'Result',actionResults:Array.from({length:25},(_,i)=>({tool:'example-'+i,result:{success:false}}))}
  ];
  const item={id:'conversation_snapshot_session',payload:{metadata:{offlineChatId:'session'},messages}};
  await sync(item,{email:'owner@jarvis.local'});
  assert.equal(records[0].messages[0].id,'user-one');
  assert.equal(records[0].messages[0].attachedFiles[0].name,'project.zip');
  assert.equal(records[0].messages[0].attachedFiles[0].url,undefined);
  assert.equal(records[0].messages[0].attachedFiles[0].metadataOnly,true);
  assert.equal(records[0].messages[1].actionResults.length,20);
  assert.equal(records[0].messages[1].actionResults[0].result.success,false);
  await sync(item,{email:'owner@jarvis.local'});
  assert.equal(records.length,1,'repeated recovery does not execute or duplicate stored actions');
  assert.equal(records[0].messages.length,2);
});

test('real recovery accepts a rolling 200-message legacy window',async()=>{
  const original=Array.from({length:200},(_,i)=>({role:i%2?'assistant':'user',content:'message-'+i}));
  const records=[{id:'existing',source:'chat',offline_sync_id:'session',messages:original}];
  const sync=actualSyncFunction(records);
  await sync({id:'conversation_snapshot_session',payload:{
    metadata:{offlineChatId:'session',conversationId:'existing'},
    messages:[...original,{role:'user',content:'message-200'}].slice(-200)
  }},{email:'owner@jarvis.local'});
  assert.equal(records[0].messages.length,200);
  assert.equal(records[0].messages[0].content,'message-1');
  assert.equal(records[0].messages.at(-1).content,'message-200');
});
