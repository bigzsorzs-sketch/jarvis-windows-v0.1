import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as messagesModule from '../lib/conversationMessages.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const history=count=>Array.from({length:count},(_,i)=>({id:'m-'+i,role:i%2?'assistant':'user',content:'message-'+i,timestamp:'2026-10-07T00:00:00.000Z'}));
function deferred(){let resolve;const promise=new Promise(res=>{resolve=res;});return {promise,resolve};}

function harness({rows=[],snapshot=null,readSnapshot,readMarker}={}){
  let migrated=false;
  const writes=[];
  const context={
    ...messagesModule,Date,Promise,
    getLocalValue:async()=>readMarker ? readMarker() : migrated,
    putLocalValue:async(_key,value)=>{migrated=value;writes.push({kind:'marker',value});},
    loadChatSnapshot:async()=>readSnapshot ? readSnapshot() : snapshot,
    saveChatSnapshot:async(messages,metadata)=>{writes.push({kind:'snapshot',messages,metadata});return {messages,metadata};},
    queueConversationSync:async(messages,metadata)=>{writes.push({kind:'queue',messages,metadata});return {messages,metadata};},
    jarvis:{entities:{Conversation:{
      get:async id=>structuredClone(rows.find(row=>row.id===id)||null),
      filter:async query=>structuredClone(rows.filter(row=>Object.entries(query).every(([key,value])=>row[key]===value))),
      create:async patch=>{const row={...structuredClone(patch),id:'row-'+(rows.length+1)};rows.push(row);return structuredClone(row);},
      update:async(id,patch)=>{const row=rows.find(row=>row.id===id);if(!row)throw new Error('NOT_FOUND');Object.assign(row,structuredClone(patch));return structuredClone(row);},
    }}},
  };
  const code=fs.readFileSync('src/lib/conversationHistory.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const api=vm.runInNewContext(code+';({saveConversationHistory,migrateLegacyChatSnapshotOnce,saveChatSnapshotAfterMigration:typeof saveChatSnapshotAfterMigration === "function" ? saveChatSnapshotAfterMigration : saveChatSnapshot,queueConversationSyncAfterMigration:typeof queueConversationSyncAfterMigration === "function" ? queueConversationSyncAfterMigration : queueConversationSync})',context);
  return {api,rows,writes,context,get migrated(){return migrated;}};
}

test('online save retains the 200-message archive when the UI holds only the latest 50',async()=>{
  const all=history(201);
  const row={id:'existing',source:'chat',offline_sync_id:'session',messages:all.slice(0,200),metadata:{old:true}};
  const h=harness({rows:[row]});
  await h.api.saveConversationHistory('existing',all.slice(-50),{offlineChatId:'session'});
  assert.equal(row.messages.length,200);
  assert.equal(row.messages[0].id,'m-1');
  assert.equal(row.messages.at(-1).id,'m-200');
  assert.equal(row.metadata.old,true);
});

test('stale online save cannot truncate a newer persisted continuation',async()=>{
  const all=history(6);
  const row={id:'existing',source:'chat',messages:all,metadata:{}};
  const h=harness({rows:[row]});
  await h.api.saveConversationHistory('existing',all.slice(0,4));
  assert.equal(row.messages.length,6);
  assert.equal(row.messages.at(-1).id,'m-5');
});

test('a previously recovered offline session is reused by the first online save',async()=>{
  const row={id:'recovered',source:'chat',offline_sync_id:'session',messages:history(2)};
  const h=harness({rows:[row]});
  assert.equal(await h.api.saveConversationHistory(null,history(3),{offlineChatId:'session'}),'recovered');
  assert.equal(h.rows.length,1);
  assert.equal(row.messages.length,3);
});

test('legacy migration reuses a linked archive instead of duplicating an already persisted chat',async()=>{
  const row={id:'existing',source:'chat',offline_sync_id:'session',messages:history(6)};
  const h=harness({rows:[row],snapshot:{messages:history(4),metadata:{conversationId:'existing',offlineChatId:'session'}}});
  const recovered=await h.api.migrateLegacyChatSnapshotOnce();
  assert.equal(recovered.id,'existing');
  assert.equal(h.rows.length,1);
  assert.equal(row.messages.length,6);
  assert.equal(h.migrated,true);
});

test('legacy migration and a recovered offline session converge on their durable offline identity',async()=>{
  const row={id:'recovered',source:'chat',offline_sync_id:'session',messages:history(3)};
  const h=harness({rows:[row],snapshot:{messages:history(4),metadata:{offlineChatId:'session'}}});
  assert.equal((await h.api.migrateLegacyChatSnapshotOnce()).id,'recovered');
  assert.equal(h.rows.length,1);
  assert.equal(row.messages.length,4);
});

test('transient snapshot read failure never marks legacy migration completed',async()=>{
  const h=harness({readSnapshot:async()=>{throw new Error('INDEXEDDB_READ_FAILED');}});
  await assert.rejects(h.api.migrateLegacyChatSnapshotOnce(),/INDEXEDDB_READ_FAILED/);
  assert.equal(h.migrated,false);
  assert.equal(h.rows.length,0);
});

test('failed history lookup never creates a duplicate legacy archive',async()=>{
  const h=harness({snapshot:{messages:history(2)}});
  h.context.jarvis.entities.Conversation.filter=async()=>{throw new Error('SQLITE_BUSY');};
  await assert.rejects(h.api.migrateLegacyChatSnapshotOnce(),/SQLITE_BUSY/);
  assert.equal(h.migrated,false);
  assert.equal(h.rows.length,0);
});

test('a boot snapshot write waits for legacy data to be recovered',async()=>{
  const gate=deferred();
  const h=harness({readSnapshot:()=>gate.promise});
  const migration=h.api.migrateLegacyChatSnapshotOnce();
  const saving=h.api.saveChatSnapshotAfterMigration([{id:'greeting',role:'assistant',content:'new greeting'}],{});
  await tick();
  assert.equal(h.writes.some(write=>write.kind==='snapshot'),false);
  gate.resolve({messages:history(2)});
  await Promise.all([migration,saving]);
  assert.equal(h.rows.length,1);
  assert.equal(h.rows[0].messages[0].content,'message-0');
  assert.equal(h.writes.at(-1).kind,'snapshot');
});

test('concurrent migration calls create exactly one archive and can retry a failed read',async()=>{
  const gate=deferred();
  let attempts=0;
  const h=harness({readSnapshot:async()=>{attempts+=1;if(attempts===1)throw new Error('READ_FAILED');return gate.promise;}});
  await assert.rejects(h.api.migrateLegacyChatSnapshotOnce(),/READ_FAILED/);
  const first=h.api.migrateLegacyChatSnapshotOnce();
  const second=h.api.migrateLegacyChatSnapshotOnce();
  await tick();
  gate.resolve({messages:history(2)});
  await Promise.all([first,second]);
  assert.equal(h.rows.length,1);
  assert.equal(attempts,2);
});
