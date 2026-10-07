import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeConversationMessages } from '../lib/conversationMessages.js';

const source=fs.readFileSync('src/lib/indexedDbOfflineStore.js','utf8');

function makeSnapshotHarness() {
  const from=source.indexOf('function compactOfflineSnapshotMessages(');
  const end=source.indexOf('export async function loadChatSnapshot(',from);
  assert.ok(from>=0 && end>from);
  let saved;
  const context={
    normalizeConversationMessages,
    STORES:{conversations:'conversations'},
    Date,
    runStore:async (_store, _mode, handler)=>{
      const mockStore={put:entry=>{saved=entry;return entry;}};
      return handler(mockStore);
    },
    putLocalValue:async()=>true
  };
  const code=source.slice(from,end).replace('export async function saveChatSnapshot','async function saveChatSnapshot');
  const save=vm.runInNewContext(code+'; saveChatSnapshot',context);
  return {save,get saved(){return saved;}};
}

test('offline snapshot and sync queue omit heavy attachment URLs but keep names',async()=>{
  const h=makeSnapshotHarness();
  const huge='data:application/octet-stream;base64,'+'A'.repeat(2*1024*1024);
  const record=await h.save([{
    role:'user',content:'analyze archive',
    attachedFiles:[{name:'project.zip',kind:'archive',type:'application/zip',size:1572864,url:huge}]
  }],{offlineChatId:'chat-1'});
  assert.equal(record.id,'active_chat');
  assert.equal(record.messages[0].content,'analyze archive');
  assert.equal(record.messages[0].attachedFiles[0].name,'project.zip');
  assert.equal(record.messages[0].attachedFiles[0].size,1572864);
  assert.equal(record.messages[0].attachedFiles[0].url,undefined);
  assert.equal(record.messages[0].attachedFiles[0].metadataOnly,true);
  assert.ok(JSON.stringify(h.saved).length<1000,'persisted IndexedDB snapshot must be compact');
});

test('messages without attachments remain unchanged, and metadata is bounded',async()=>{
  const h=makeSnapshotHarness();
  const messages=[
    {role:'assistant',content:'hello'},
    {role:'user',content:'image attached',attachedFiles:Array.from({length:20},(_,i)=>({
      name:'photo-'+i,kind:'image',url:'data:image/png;base64,aGVsbG8='
    }))}
  ];
  const snapshot=await h.save(messages,{detectedLang:'hu'});
  assert.equal(snapshot.messages[0].content,'hello');
  assert.equal(snapshot.messages[1].attachedFiles.length,20);
  assert.equal(snapshot.messages[1].attachedFiles[0].name,'photo-0');
  assert.ok(!JSON.stringify(snapshot).includes('data:image/png'));
});
