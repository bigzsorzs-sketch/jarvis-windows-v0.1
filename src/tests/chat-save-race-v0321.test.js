import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createConversationSaveSession, enqueueConversationSave } from '../lib/chatSessionPersistence.js';

const flush = () => new Promise((resolve)=>setImmediate(resolve));

test('an old in-flight save cannot assign its ID to a newly selected conversation', async () => {
  let release;
  const gate=new Promise((resolve)=>{release=resolve;});
  let current = createConversationSaveSession();
  const old=current;
  const assignments=[];
  const write = async (id, messages) => {
    assert.equal(id,null);
    await gate;
    return 'old-id';
  };
  const saving=enqueueConversationSave(old,[{role:'user',content:'old message'}],{},write,
    (id,session) => {if(current===session)assignments.push(id);});
  await flush();
  current=createConversationSaveSession('new-id');
  release();
  await saving;
  assert.equal(old.id,'old-id');
  assert.equal(current.id,'new-id');
  assert.deepEqual(assignments,[]);
});

test('queued saves on one new conversation create exactly once and reuse the returned ID', async () => {
  const session=createConversationSaveSession();
  const saved=[];
  const write=async(id,messages)=>{
    saved.push({id,content:messages[0].content});
    return id || 'single-conversation-id';
  };
  const first=enqueueConversationSave(session,[{role:'user',content:'first'}],{},write);
  const second=enqueueConversationSave(session,[{role:'user',content:'second'}],{},write);
  await Promise.all([first,second]);
  assert.deepEqual(saved,[{id:null,content:'first'},
    {id:'single-conversation-id',content:'second'}]);
  assert.equal(session.id,'single-conversation-id');
});

test('older session writes can finish after a new session begins, without mixing messages',async()=>{
  let release;
  const gate=new Promise((resolve)=>{release=resolve;});
  let active=createConversationSaveSession('existing-old-id');
  const old=active,rows=[],assignments=[];
  const save=async(id,msgs)=>{
    if(id==='existing-old-id') await gate;
    rows.push({id,content:msgs[0].content});
    return id || 'newly-created-id';
  };
  const first=enqueueConversationSave(old,[{role:'user',content:'OLD'}],{},save,
    (id,session)=>{if(session===active) assignments.push(id);});
  await flush();
  active=createConversationSaveSession();
  const second=enqueueConversationSave(active,[{role:'user',content:'NEW'}],{},save,
    (id,session)=>{if(session===active) assignments.push(id);});
  await second;
  release();
  await first;
  assert.deepEqual(rows,[{id:null,content:'NEW'},{id:'existing-old-id',content:'OLD'}]);
  assert.deepEqual(assignments,['newly-created-id']);
  assert.equal(active.id,'newly-created-id');
});

test('a failed save does not poison the queue of that conversation',async()=>{
  const session=createConversationSaveSession();
  const failures=[];
  let attempts=0;
  const save=async()=>{
    attempts++;
    if(attempts===1)throw new Error('TEMPORARY_SQLITE_ERROR');
    return 'recovered-id';
  };
  const first=enqueueConversationSave(session,[{role:'user',content:'first'}],{},save,
    null,(e)=>failures.push(e.message));
  const second=enqueueConversationSave(session,[{role:'user',content:'second'}],{},save);
  await Promise.all([first,second]);
  assert.equal(session.id,'recovered-id');
  assert.deepEqual(failures,['TEMPORARY_SQLITE_ERROR']);
});

test('Chat captures its save session instead of reading active ref after async scheduling',()=>{
  const chat=fs.readFileSync('src/pages/Chat.jsx','utf8');
  assert.match(chat,/const saveSession = conversationSaveSessionRef\.current;/);
  assert.match(chat,/enqueueConversationSave\(\s*saveSession/);
  assert.match(chat,/if \(conversationSaveSessionRef\.current !== savedSession\) return/);
  assert.match(chat,/conversationSaveSessionRef\.current = createConversationSaveSession\(conversation\.id\)/);
  assert.match(chat,/conversationSaveSessionRef\.current = createConversationSaveSession\(\)/);
  assert.doesNotMatch(chat,/persistConversationRef\.current/);
});
