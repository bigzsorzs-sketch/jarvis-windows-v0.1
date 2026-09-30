import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('src/lib/indexedDbOfflineStore.js','utf8');
const from=source.indexOf('export async function mutateSyncActionIfUnchanged(');
const to=source.indexOf('export async function updateSyncAction(',from);
assert.ok(from>=0&&to>from,'atomic queue mutation must exist');
const method=source.slice(from,to).replace(/^export\s+/,'');

function harness(rows=[]) {
  const data=new Map(rows.map(x=>[x.id,{...x}]));
  const db={
    transaction:()=>{
      const tx={error:null};
      const store={
        get(id) {
          const request={};
          queueMicrotask(()=>{
            request.result=data.get(id);
            request.onsuccess?.();
            queueMicrotask(()=>tx.oncomplete?.());
          });
          return request;
        },
        put(value) {data.set(value.id,value);return {};},
        delete(id) {data.delete(id);return {};}
      };
      tx.objectStore=()=>store;
      return tx;
    }
  };
  const fn=vm.runInNewContext(method+'; mutateSyncActionIfUnchanged',{
    openOfflineDb:async()=>db,
    STORES:{syncQueue:'syncQueue'},
    Date,
    logger:{warn:()=>{}},
    Error,
  });
  return {fn,data};
}

test('unchanged work is claimed and deleted only after the transaction completes',async()=>{
  const old={id:'chat-a',revision:'old-rev',status:'pending',createdAt:100,
    payload:{updatedAt:100}};
  const {fn,data}=harness([old]);
  assert.equal(await fn(old,{status:'syncing'}),true);
  assert.equal(data.get(old.id).status,'syncing');
  assert.equal(await fn(old),true);
  assert.equal(data.has(old.id),false);
});

test('a newer payload with the same ID is retained after older sync finishes',async()=>{
  const old={id:'chat-a',revision:'old-rev',status:'pending',createdAt:100,
    payload:{updatedAt:100,messages:['old']}};
  const replacement={id:'chat-a',revision:'new-rev',status:'pending',createdAt:101,
    payload:{updatedAt:101,messages:['new user message']}};
  const {fn,data}=harness([old]);
  assert.equal(await fn(old,{status:'syncing'}),true);
  data.set(old.id,replacement);
  assert.equal(await fn(old),false);
  assert.equal(data.get(old.id).payload.messages[0],'new user message');
  assert.equal(data.get(old.id).status,'pending');
});

test('old failure cannot permanently block an updated chat entry',async()=>{
  const old={id:'chat-a',revision:'old-rev',createdAt:100,
    payload:{updatedAt:100},status:'syncing'};
  const replacement={id:'chat-a',revision:'new-rev',createdAt:102,
    payload:{updatedAt:102},status:'pending'};
  const {fn,data}=harness([old]);
  data.set(old.id,replacement);
  assert.equal(await fn(old,{
    status:'failed',retry_count:5,requires_manual_retry:true
  }),false);
  assert.equal(data.get(old.id).status,'pending');
  assert.equal(data.get(old.id).retry_count,undefined);
});

test('legacy item is matched only while its original snapshot is unchanged',async()=>{
  const old={id:'legacy',createdAt:100,payload:{updatedAt:100},status:'pending'};
  const {fn,data}=harness([old]);
  assert.equal(await fn(old,{status:'syncing'}),true);
  data.set(old.id,{...old,payload:{updatedAt:200},status:'pending'});
  assert.equal(await fn(old),false);
  assert.equal(data.get(old.id).payload.updatedAt,200);
});

test('the real manager claims, removes and retries only matching queue revisions',()=>{
  assert.match(source,/revision: crypto\.randomUUID\(\)/);
  const manager=fs.readFileSync('src/lib/offlineSyncManager.js','utf8');
  assert.match(manager,/const claimed = await mutateSyncActionIfUnchanged\(item/);
  assert.match(manager,/const removed = await mutateSyncActionIfUnchanged\(item\)/);
  assert.match(manager,/rescanNeeded && networkMonitor\.isOnline\(\)/);
});
