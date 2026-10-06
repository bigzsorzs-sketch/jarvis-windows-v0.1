import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { normalizeConversationMessages } from '../lib/conversationMessages.js';

const source = fs.readFileSync('src/lib/indexedDbOfflineStore.js','utf8');
const start = source.indexOf('async function runStore(');
const end = source.indexOf('// Compare-and-swap', start);
const tick = () => new Promise(resolve=>setImmediate(resolve));

function harness({ available = true, transactionError = null } = {}) {
  const transactions = [];
  const db = {
    transaction(name) {
      if (transactionError) throw transactionError;
      const request = { result:'written-key' };
      const tx = {
        name, request, error:null,
        objectStore:()=>({ put:()=>request, get:()=>request, getAll:()=>request }),
        abort() { tx.onabort?.(); },
      };
      transactions.push(tx);
      return tx;
    },
  };
  const api = vm.runInNewContext(source.slice(start,end).replace(/export /g,'')
    + ';({runStore,enqueueSyncAction,saveChatSnapshot,queueConversationSync})', {
    openOfflineDb:async()=>available ? db : null,
    logger:{warn() {}}, normalizeConversationMessages, crypto:webcrypto,
    STORES:{kv:'kv',conversations:'conversations',syncQueue:'syncQueue'}, Date,
  });
  return { api, transactions };
}

test('offline enqueue acknowledges success only after the transaction commits',async()=>{
  const h = harness();
  let settled = false;
  const pending = h.api.enqueueSyncAction({type:'conversation_snapshot',payload:{messages:['visible']}})
    .then(entry=>{settled=true;return entry;});
  await tick();
  const tx = h.transactions[0];
  tx.request.onsuccess();
  await tick();
  assert.equal(settled,false);
  tx.oncomplete();
  const entry = await pending;
  assert.equal(entry.status,'pending');
  assert.ok(entry.id && entry.revision);
});

test('abort after request success rejects the write instead of returning a saved entry',async()=>{
  const h = harness();
  const pending = h.api.enqueueSyncAction({type:'conversation_snapshot'});
  const rejected = assert.rejects(pending,/QuotaExceededError/);
  await tick();
  const tx = h.transactions[0];
  tx.request.onsuccess();
  tx.error = new Error('QuotaExceededError');
  tx.onabort();
  await rejected;
});

test('snapshot failure never enqueues a falsely acknowledged conversation',async()=>{
  const h = harness();
  const messages = [{role:'user',content:'keep this in memory'}];
  const pending = h.api.queueConversationSync(messages,{offlineChatId:'session'});
  const rejected = assert.rejects(pending,/OFFLINE_STORAGE_TRANSACTION_FAILED/);
  await tick();
  h.transactions[0].request.onsuccess();
  h.transactions[0].onerror();
  await rejected;
  assert.equal(h.transactions.length,1);
  assert.equal(h.transactions[0].name,'conversations');
  assert.equal(messages[0].content,'keep this in memory');
});

test('snapshot resolves only after both the message and metadata writes commit',async()=>{
  const h = harness();
  let settled = false;
  const pending = h.api.saveChatSnapshot([{role:'user',content:'save'}]).then(value=>{settled=true;return value;});
  await tick();
  h.transactions[0].request.onsuccess();
  h.transactions[0].oncomplete();
  await tick();
  assert.equal(h.transactions[1].name,'kv');
  h.transactions[1].request.onsuccess();
  await tick();
  assert.equal(settled,false);
  h.transactions[1].oncomplete();
  assert.equal((await pending).id,'active_chat');
});

test('unavailable or synchronously failing storage rejects writes while reads can fall back',async()=>{
  for (const options of [{available:false},{transactionError:new Error('InvalidStateError')}]) {
    const h = harness(options);
    await assert.rejects(h.api.enqueueSyncAction({type:'conversation_snapshot'}), /OFFLINE_STORAGE_UNAVAILABLE|InvalidStateError/);
    assert.equal(await h.api.runStore('kv','readonly',store=>store.get('missing')),null);
  }
});

test('synchronous handler and request errors are propagated and cannot commit successfully',async()=>{
  const h = harness();
  await assert.rejects(h.api.runStore('kv','readwrite',()=>{throw new Error('DataCloneError');}), /DataCloneError/);
  const pending = h.api.runStore('kv','readwrite',store=>store.put({}));
  const rejected = assert.rejects(pending,/ConstraintError/);
  await tick();
  const tx = h.transactions[1];
  tx.request.error = new Error('ConstraintError');
  tx.request.onerror();
  tx.oncomplete();
  await rejected;
});
