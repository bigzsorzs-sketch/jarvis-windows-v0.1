import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureConversationMessageIdentity,
  normalizeConversationMessages,
  mergeConversationMessages,
} from '../lib/conversationMessages.js';

const history = (count, ids = true) => Array.from({ length: count }, (_, i) => ({
  ...(ids ? { id:'message-'+i } : {}),
  role:i % 2 ? 'assistant' : 'user', content:'content-'+i,
  timestamp:'2026-10-06T10:00:00.000Z',
}));

test('new message identity is stable across UI and concurrent save paths', () => {
  const raw = { role:'user', content:'hello', attachedFiles:[{ name:'file', url:'data:raw' }] };
  const first = ensureConversationMessageIdentity(raw);
  const second = ensureConversationMessageIdentity(raw);
  assert.equal(first.id, second.id);
  assert.equal(first.timestamp, second.timestamp);
  assert.equal(ensureConversationMessageIdentity(first), first);
  assert.equal(raw.id, undefined, 'the React source object is not mutated');
  assert.equal(first.attachedFiles[0].url, 'data:raw', 'active attachments remain usable');
  const stored = normalizeConversationMessages([first])[0];
  assert.equal(stored.id, first.id);
  assert.equal(stored.timestamp, first.timestamp);
  assert.equal(stored.attachedFiles[0].url, undefined);
  assert.equal(normalizeConversationMessages([raw])[0].id, undefined, 'legacy records do not receive guessed identities');
});

for (const ids of [true, false]) {
  for (const limit of [50, 200]) {
    test(`${limit}-message rolling window appends correctly ${ids ? 'with IDs' : 'for unique legacy text'}`, () => {
      const all = history(limit + 1, ids);
      const current = all.slice(0, limit);
      current[1] = { ...current[1], actionResults:[{ result:{ success:true } }] };
      const incoming = all.slice(1);
      const merged = mergeConversationMessages(current, incoming);
      assert.equal(merged.at(-1).content, 'content-'+limit);
      assert.equal(merged.length, Math.min(200, limit + 1));
      assert.equal(merged.find(message=>message.content==='content-1').actionResults[0].result.success, true);
      const again = mergeConversationMessages(merged, incoming);
      assert.deepEqual(again, merged, 'recovery is idempotent');
      const stale = mergeConversationMessages(merged, all.slice(0, limit));
      assert.deepEqual(stale, merged, 'older windows never truncate newer replies');
    });
  }
}

test('stable IDs allow one-message overlap despite repeated text', () => {
  const current = [{ id:'a', role:'user', content:'yes' }, { id:'b', role:'user', content:'yes' }];
  const incoming = [{ id:'b', role:'user', content:'yes' }, { id:'c', role:'assistant', content:'done' }];
  assert.deepEqual(mergeConversationMessages(current, incoming).map(message=>message.id), ['a','b','c']);
});

test('ambiguous repeated legacy windows and lone boundary matches remain conflicts', () => {
  const repeat = Array.from({ length:8 }, (_, i) => ({ role:i % 2 ? 'assistant' : 'user', content:i % 2 ? 'ok' : 'yes' }));
  assert.throws(()=>mergeConversationMessages(repeat.slice(0,6),repeat.slice(2)), /OFFLINE_SYNC_CONVERSATION_CONFLICT/);
  assert.throws(()=>mergeConversationMessages(
    [{role:'user',content:'old'},{role:'assistant',content:'ok'}],
    [{role:'assistant',content:'ok'},{role:'user',content:'unrelated'}]
  ), /OFFLINE_SYNC_CONVERSATION_CONFLICT/);
  assert.throws(()=>mergeConversationMessages(
    [{role:'user',content:'hello'}],
    [{role:'user',content:'different first message'},{role:'user',content:'hello'},{role:'assistant',content:'unrelated'}]
  ), /OFFLINE_SYNC_CONVERSATION_CONFLICT/);
});

test('same ID with changed content, divergent branches, reordering and duplicate IDs cannot merge', () => {
  const current = history(3);
  for (const incoming of [
    [{...current[1],content:'changed'},current[2]],
    [current[0],{id:'fork',role:'assistant',content:'different reply'}],
    [current[2],current[1]],
    [current[2],current[2]],
  ]) assert.throws(()=>mergeConversationMessages(current,incoming), /OFFLINE_SYNC_CONVERSATION_CONFLICT/);
});

test('overlap preserves richer local evidence and adds missing compact metadata', () => {
  const current = history(2);
  current[1].actionResults = [{ tool:'switch', result:{ success:false } }];
  const incoming = history(3);
  incoming[1].attachedFiles = [{ name:'project.zip', kind:'archive', url:'data:secret', size:4 }];
  incoming[1].actionResults = [{ tool:'switch', result:{ success:false } }, { tool:'status', result:{ success:true } }];
  const merged = mergeConversationMessages(current,incoming);
  assert.equal(merged[1].actionResults.length,2);
  assert.equal(merged[1].actionResults[0].result.success,false);
  assert.equal(merged[1].attachedFiles[0].name,'project.zip');
  assert.equal(merged[1].attachedFiles[0].metadataOnly,true);
  assert.equal(merged[1].attachedFiles[0].url,undefined);
});
