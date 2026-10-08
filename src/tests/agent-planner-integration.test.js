import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleHarness } from './helpers/runtime-module.js';
import * as capabilities from '../lib/capabilityRegistry.js';
import { summarizeActionResults } from '../lib/assistantResponseHandler.js';

const step = (id, tool = 'create_note', params = { content: 'Buyer demo' }, extra = {}) =>
  ({ id, tool, params, success_criteria: 'result.success is true', ...extra });
const ready = (...steps) => ({ status: 'ready', steps });

function agentHarness(plans, execute = async () => ({ success: true, message: 'Saved', data: { id: 'note-1' } })) {
  const requests = [], actions = [], episodes = [];
  const h = moduleHarness({ stubs: {
    '@/lib/llmGateway': { invokeWithRetry: async request => {
      requests.push(request);
      const plan = plans[Math.min(requests.length - 1, plans.length - 1)];
      if (plan instanceof Error) throw plan;
      return { data: { result: plan } };
    } },
    '@/lib/assistantTools': { executeActions: async ([action]) => {
      actions.push(action);
      const result = await execute(action, actions.length);
      return result?.blocked ? [result] : [{ ...action, result }];
    } },
    '@/lib/capabilityRegistry': capabilities,
    '@/lib/agentMemory': { findRelevantAgentEpisodes: async () => [], formatAgentEpisodes: () => '(none)',
      recordAgentEpisode: async episode => episodes.push(episode) },
  } });
  return { ...h.load('src/lib/agentOrchestrator.js'), requests, actions, episodes };
}

test('a real planner call receives its chat/voice/live source without an undeclared variable', async () => {
  for (const source of ['chat', 'voice', 'live']) {
    const h = agentHarness([ready(step('s1'))]);
    const result = await h.runAgentTask({ goal: 'Create a note then save it', source });
    assert.equal(result.intent, 'agent_task');
    assert.equal(h.requests[0].request_origin, 'conversation');
    assert.equal(h.actions.length, 1);
    assert.equal(h.episodes[0].source, source);
  }
});

test('missing or malformed tool acknowledgement cannot complete an agent task', async () => {
  for (const result of [undefined, null, {}, { message: 'No receipt' }, { success: 'true' }]) {
    const h = agentHarness([ready(step('s1'))], async () => result);
    const reply = await h.runAgentTask({ goal: 'Create a note then save it' });
    assert.notEqual(reply.intent, 'agent_task');
    assert.equal(h.episodes.at(-1).outcome, 'partial');
    assert.equal(h.actions.length, 1, 'an uncertain write must not be retried');
    assert.equal(reply.actionResults[0].ok, false);
  }
});

test('a failed prerequisite stops dependent writes and is not automatically replayed', async () => {
  const h = agentHarness([ready(step('s1'), step('s2', 'log_finance', { description: 'Sale', amount: 40 }))],
    async () => ({ success: false, message: 'Storage unavailable' }));
  const result = await h.runAgentTask({ goal: 'Create a note then log a sale' });
  assert.equal(h.actions.length, 1);
  assert.equal(h.requests.length, 1);
  assert.equal(result.intent, 'agent_task_partial');
  assert.match(result.reply, /0\/2/);
});

test('a read-only recovery keeps completed writes and supplies their receipts to the planner', async () => {
  const plans = [ready(step('s1'), step('s2', 'search_data', { query: 'Buyer demo' }))];
  const h = agentHarness(plans, async action => action.tool === 'search_data' && h.actions.length === 2
    ? { success: false, message: 'Temporary read failure' }
    : { success: true, message: 'Saved', data: { id: 'note-1' } });
  const result = await h.runAgentTask({ goal: 'Create a note then find it' });
  assert.equal(h.actions.filter(action => action.tool === 'create_note').length, 1);
  assert.equal(h.actions.filter(action => action.tool === 'search_data').length, 2);
  assert.equal(result.intent, 'agent_task');
  assert.match(result.reply, /2\/2/);
  assert.match(h.requests[1].prompt, /note-1/);
  assert.equal(h.requests[1].contains_sensitive_context, true);
});

test('dependent tools receive the actual preceding result ID, not an invented invoice ID', async () => {
  const h = agentHarness([ready(step('invoice', 'create_invoice', { client_name: 'Demo' }),
    step('pdf', 'generate_pdf', { invoice_id: { $ref: 'invoice.data.id' } }))],
  async action => ({ success: true, message: 'Completed', data: { id: action.tool === 'create_invoice' ? 'invoice-real-9' : 'pdf-9' } }));
  assert.equal((await h.runAgentTask({ goal: 'Create an invoice then generate its PDF' })).intent, 'agent_task');
  assert.equal(h.actions[1].params.invoice_id, 'invoice-real-9');
});

test('unresolved, forward, inherited and prototype references never reach a tool', async () => {
  for (const ref of ['missing.data.id', 's2.data.id', 's1.data.missing', 's1.__proto__.constructor', 's1.data.constructor']) {
    const h = agentHarness([ready(step('s1'), step('s2', 'generate_pdf', { invoice_id: { $ref: ref } }))]);
    const result = await h.runAgentTask({ goal: 'Create an invoice then generate its PDF' });
    assert.equal(h.actions.length, 1, ref);
    assert.notEqual(result.intent, 'agent_task', ref);
  }
});

test('invalid/empty plans, duplicate IDs and an unverified done response cannot claim completion', async () => {
  for (const plan of [{}, null, [], { status: 'ready' }, ready(), { status: 'done', summary: 'Everything sent' },
    ready(step('same'), step('same')), ready(...Array.from({ length: 7 }, (_, i) => step('s' + i)))]) {
    const h = agentHarness([plan]);
    const result = await h.runAgentTask({ goal: 'Create a note then save it' });
    assert.equal(result.handled, true);
    assert.notEqual(result.intent, 'agent_done');
    assert.notEqual(result.intent, 'agent_task');
    assert.equal(h.actions.length, 0);
    assert.notEqual(h.episodes.at(-1).outcome, 'success');
  }
});

test('a planner outage after a completed write returns its partial result instead of losing it', async () => {
  const h = agentHarness([ready(step('s1'), step('s2', 'search_data', { query: 'demo' })), new Error('Provider offline')],
    async action => ({ success: action.tool !== 'search_data', message: 'Receipt', data: { id: 'saved-note' } }));
  const result = await h.runAgentTask({ goal: 'Create a note then find it' });
  assert.equal(result.intent, 'agent_task_partial');
  assert.equal(result.actionResults.filter(action => action.ok).length, 1);
  assert.equal(h.actions.filter(action => action.tool === 'create_note').length, 1);
});

test('a done response after a failed read cannot erase a previously completed write or pending step', async () => {
  const h = agentHarness([ready(step('s1'), step('s2', 'search_data', { query: 'demo' })), {status:'done'}],
    async action => ({success:action.tool !== 'search_data',message:'Receipt',data:{id:'saved-note'}}));
  const result = await h.runAgentTask({goal:'Create a note then find it'});
  assert.equal(result.intent,'agent_task_partial');
  assert.match(result.reply,/1\/2/);
  assert.equal(h.episodes.at(-1).outcome,'partial');
});

test('a recovery plan cannot redefine the ID of an already completed write', async () => {
  const h = agentHarness([ready(step('s1'),step('s2','search_data',{query:'demo'})),
    ready(step('s1','create_note',{content:'Changed content'}),step('s2','search_data',{query:'demo'}))],
    async action => ({success:action.tool !== 'search_data',message:'Receipt',data:{id:'saved-note'}}));
  const result = await h.runAgentTask({goal:'Create a note then find it'});
  assert.equal(result.intent,'agent_task_partial');
  assert.equal(h.actions.filter(action => action.tool === 'create_note').length,1);
});

test('a cancelled confirmation stops the plan without another prompt or dependent operation', async () => {
  const h = agentHarness([ready(step('s1', 'draft_email', { to: 'demo@example.test' }), step('s2'))],
    async () => ({ blocked: 'Owner declined', result: { success: false, message: 'Owner declined' } }));
  const result = await h.runAgentTask({ goal: 'Send an email then save a note' });
  assert.equal(h.actions.length, 1);
  assert.equal(h.requests.length, 1);
  assert.equal(result.intent, 'agent_task_partial');
});

test('a draft or unverified device state does not satisfy a required sent/live result', async () => {
  for (const [tool, data, expected_result] of [
    ['draft_email', { sent: false }, { 'data.sent': true }],
    ['check_device_status', { verified: false, status: 'on' }, { 'data.verified': true }],
  ]) {
    const h = agentHarness([ready(step('s1', tool, {}, { expected_result }))],
      async () => ({ success: true, message: 'Only cached/drafted', data }));
    const result = await h.runAgentTask({ goal: 'Complete the requested operation and verify it' });
    assert.notEqual(result.intent, 'agent_task');
    assert.ok(result.actionResults.every(action => !action.ok));
  }
});

test('assistant action summaries require explicit success and respect blocking', () => {
  for (const result of [{}, { result: {} }, { blocked: 'declined', result: { success: true } }]) {
    assert.notEqual(summarizeActionResults([result], 'hu'), 'Kész.');
  }
});

function routerHarness() {
  const calls = [];
  const h = moduleHarness({ stubs: {
    '@/lib/chatOrchestrator': { runAssistantTurn: async () => { calls.push('chat'); return { reply: 'Chat' }; } },
    '@/lib/globalVoiceActions': { executeGlobalVoiceCommand: async () => { calls.push('voice-fallback'); return { handled: true, reply: 'Voice' }; } },
    '@/lib/commandIntents': { findLocalUiCommand: () => null, findWorkflowCommand: () => null,
      findAIToolCommand: async () => { calls.push('single-tool'); return { handled: true, intent: 'single-tool' }; } },
    '@/lib/supportAssistant': { findSupportResponse: () => null },
    '@/lib/voiceCommandRouter': { isCallCommand: () => false, extractCallTarget: () => '', isGlobalVoiceCommand: () => false },
    '@/lib/normalizeAssistantReply': { default: value => value, __esModule: true },
    '@/lib/fastChatReplies': { findFastChatReply: () => null },
    '@/lib/codeAssistant': { isCodeAssistantRequest: () => false },
    '@/lib/agentOrchestrator': { shouldUseAgentPlanner: text => /then/.test(text),
      runAgentTask: async options => { calls.push('agent:' + options.source); return { handled: true, intent: 'agent_task' }; } },
    '@/lib/globalVoiceNavigator': { resolveGlobalUiCommand: () => null },
  } });
  return { ...h.load('src/lib/CommandRouter.js'), calls };
}

test('chat, voice and live multi-step commands reach the agent before a single-intent fallback', async () => {
  for (const source of ['chat', 'voice', 'live']) {
    const h = routerHarness();
    const result = await h.routeUserCommand({ text: 'Log my reading then create a reminder', source });
    assert.equal(result.intent, 'agent_task');
    assert.deepEqual(h.calls, ['agent:' + source]);
  }
});

test('simple commands retain their direct tool route', async () => {
  const h = routerHarness();
  assert.equal((await h.routeUserCommand({ text: 'Log my reading' })).intent, 'single-tool');
  assert.deepEqual(h.calls, ['single-tool']);
});
