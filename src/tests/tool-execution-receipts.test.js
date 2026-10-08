import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleHarness } from './helpers/runtime-module.js';
import * as capabilities from '../lib/capabilityRegistry.js';

function toolHarness() {
  const records = [], notes = [];
  const jarvis = { auth: { me: async () => ({ email: 'owner@example.test' }) }, entities: {
    Note: { create: async note => { const row = { ...note, id: 'note-' + (notes.length + 1) }; notes.push(row); return row; } },
    ActionLog: { create: async entry => entry },
    AgentEpisode: { create: async entry => { records.push(entry); return entry; } },
  } };
  const h = moduleHarness({ stubs: {
    '@/api/jarvisClient': { jarvis },
    './environmentTools': { ENV_TOOLS: {} },
    './languageEngine': {},
    './ecosystemEngine': {},
    '@/lib/logger': { logger: { info() {}, warn() {}, error() {} } },
    '@/lib/capabilityRegistry': capabilities,
  }, globals: { window: { confirm: () => true }, setTimeout: fn => { fn(); return 1; } } });
  return { ...h.load('src/lib/assistantTools.js'),
    ...h.load('src/lib/agentMemory.js'), notes, records };
}

test('the executor converts absent acknowledgements to failure and never remembers them as success', async () => {
  const h = toolHarness();
  h.TOOLS.create_note = async () => undefined;
  const [execution] = await h.executeActions([{ tool: 'create_note', params: { content: 'Demo' } }]);
  assert.equal(execution.result?.success, false);
  assert.equal(h.records.at(-1).outcome, 'failed');
});

test('an exception after a write cannot make the executor duplicate that write', async () => {
  const h = toolHarness();
  let calls = 0;
  h.TOOLS.create_note = async () => { calls++; h.notes.push({ id: 'committed-' + calls }); throw new Error('Response lost after commit'); };
  const [execution] = await h.executeActions([{ tool: 'create_note', params: { content: 'Demo' } }]);
  assert.equal(calls, 1);
  assert.equal(h.notes.length, 1);
  assert.equal(execution.result.success, false);
});

test('a classified read may retry a transient failure and still requires a receipt', async () => {
  const h = toolHarness();
  let calls = 0;
  h.TOOLS.search_data = async () => { if (++calls === 1) throw Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' });
    return { success: true, data: [] }; };
  const [execution] = await h.executeActions([{ tool: 'search_data', params: { query: 'Demo' } }]);
  assert.equal(calls, 2);
  assert.equal(execution.result.success, true);
});

test('an ordinary local note uses the real tool and stores an explicit successful receipt', async () => {
  const h = toolHarness();
  const [execution] = await h.executeActions([{ tool: 'create_note', params: { content: 'Buyer demo' } }]);
  assert.equal(execution.result.success, true);
  assert.equal(h.notes[0].content, 'Buyer demo');
  assert.equal(h.notes[0].created_by, 'owner@example.test');
  assert.equal(h.records.at(-1).outcome, 'success');
});

test('operational memory alone cannot turn a missing receipt into verified success', async () => {
  const h = toolHarness();
  for (const result of [undefined, {}, { success: 'true' }, { success: false }]) {
    await h.recordActionEpisode({ tool: 'create_note', result });
    assert.equal(h.records.at(-1).outcome, 'failed');
    assert.equal(JSON.parse(h.records.at(-1).evidence).success, false);
  }
});

test('disabled capabilities are blocked even outside the agent planner', async () => {
  const original = capabilities.getCapability('create_note');
  capabilities.registerCapability({...original,enabled:false});
  try {
    const h = toolHarness();
    const [execution] = await h.executeActions([{tool:'create_note',params:{content:'Demo'}}]);
    assert.equal(execution.result.success,false);
    assert.ok(execution.blocked);
    assert.equal(h.notes.length,0);
  } finally {
    capabilities.registerCapability(original);
  }
});
