import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

function harness({quota=false,unavailable=false,native=null}={}){
  const values=new Map([['jarvis_local_user',JSON.stringify({id:'local-owner',email:'owner@jarvis.local'})]]);
  const storage={
    get length(){return values.size;},key:index=>[...values.keys()][index],
    getItem:key=>values.get(key)||null,
    setItem:(key,value)=>{if(quota)throw new Error('QuotaExceededError');values.set(key,value);},
  };
  const window={jarvisDesktop:native ? {data:native} : null};
  Object.defineProperty(window,'localStorage',{get:()=>{if(unavailable)throw new Error('SecurityError');return storage;}});
  const source=fs.readFileSync('src/api/jarvisClient.js','utf8').replace('export const jarvis','const jarvis').replace('export default jarvis;','');
  const api=vm.runInNewContext(source+';jarvis',{window,crypto:webcrypto,structuredClone,console:{warn(){}},Date});
  return {api,values};
}

test('local fallback creation cannot report success after a quota failure',async()=>{
  const h=harness({quota:true});
  await assert.rejects(h.api.entities.Note.create({text:'unsaved'}),/QuotaExceededError/);
  assert.equal(h.values.has('jarvis_entity_Note'),false);
});

test('failed local update and deletion preserve the existing stored rows',async()=>{
  const h=harness({quota:true});
  const original=JSON.stringify([{id:'note',text:'original'}]);
  h.values.set('jarvis_entity_Note',original);
  await assert.rejects(h.api.entities.Note.update('note',{text:'replacement'}),/QuotaExceededError/);
  await assert.rejects(h.api.entities.Note.delete('note'),/QuotaExceededError/);
  assert.equal(h.values.get('jarvis_entity_Note'),original);
});

test('unavailable browser storage rejects persistent operations',async()=>{
  const h=harness({unavailable:true});
  await assert.rejects(h.api.entities.Note.create({text:'unsaved'}),/LOCAL_STORAGE_UNAVAILABLE|SecurityError/);
});

test('corrupt browser rows cannot be silently replaced with an empty collection',async()=>{
  const h=harness();
  h.values.set('jarvis_entity_Note','{broken');
  await assert.rejects(h.api.entities.Note.create({text:'replacement'}),/LOCAL_STORAGE_CORRUPT|SyntaxError/);
  assert.equal(h.values.get('jarvis_entity_Note'),'{broken');
});

test('native migration failure is propagated, then retried before later operations',async()=>{
  let migrations=0,reads=0;
  const native={
    importLegacy:async()=>({success:++migrations>1}),
    getUser:async()=>{reads+=1;return {id:'owner'};},
  };
  const h=harness({native});
  await assert.rejects(h.api.auth.me(),/LOCAL_MIGRATION_FAILED/);
  assert.equal(reads,0);
  assert.equal((await h.api.auth.me()).id,'owner');
  assert.equal(migrations,2);
  assert.equal(reads,1);
});
