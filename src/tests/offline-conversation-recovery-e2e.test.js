import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const syncSource = fs.readFileSync('src/lib/offlineSyncManager.js','utf8');
const storeSource = fs.readFileSync('src/lib/indexedDbOfflineStore.js','utf8');

function actualSyncFunction(records) {
  const start = syncSource.indexOf('async function syncConversationSnapshot(');
  const end = syncSource.indexOf('export async function syncOfflineData(',start);
  assert.ok(start>=0 && end>start,'source function exists');
  const jarvis = { entities:{ Conversation:{
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
    {jarvis,Date});
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
  await sync(item('chat-a','updated chat-a'),{email:'owner@jarvis.local'});
  assert.equal(records.length,2,'retry remains idempotent');
  assert.equal(records[0].messages[0].content,'updated chat-a');
  assert.equal(records[1].messages[0].content,'identical title');
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
