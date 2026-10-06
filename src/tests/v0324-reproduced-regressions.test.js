import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import {
  isInternalAssistantOperationEnvelope,
  sanitizeAssistantText,
  SAFE_ASSISTANT_FALLBACK,
} from '../lib/assistantResponseHandler.js';

const require = createRequire(import.meta.url);
const source = (file) => fs.readFileSync(file, 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));

function loadScript(file, context, expression) {
  const code = source(file)
    .replace(/^import .*;\n/gm, '')
    .replace(/export default /g, '')
    .replace(/export /g, '');
  return vm.runInNewContext(`${code};${expression}`, context);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('local device HTTP success is not state verification', async () => {
  let body = '{"POWER":"OFF"}';
  const main = source('electron/main.cjs');
  const start = main.indexOf('function buildLocalDeviceUrl(');
  const end = main.indexOf('function functionPolicyAction(', start);
  assert.ok(start >= 0 && end > start);

  const requestLocalDevice = vm.runInNewContext(
    main.slice(start, end) + ';requestLocalDevice',
    {
      require,
      URL,
      AbortController,
      setTimeout,
      clearTimeout,
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => body,
      }),
    },
  );

  let result = await requestLocalDevice({ base:'http://127.0.0.1', command:'/power-on', expectedState:'on' });
  assert.equal(result.transportSuccess, true);
  assert.equal(result.success, false);
  assert.equal(result.observedState, 'off');
  assert.equal(result.verified, false);

  body = '{"POWER":"ON"}';
  result = await requestLocalDevice({ base:'http://127.0.0.1', command:'/power-off', expectedState:'off' });
  assert.equal(result.observedState, 'on');
  assert.equal(result.verified, false);

  for (const invalid of ['', '{}', '{"POWER":"UNKNOWN"}', 'not-json']) {
    body = invalid;
    result = await requestLocalDevice({ base:'http://127.0.0.1', command:'/power-on', expectedState:'on' });
    assert.equal(result.observedState, null);
    assert.equal(result.verified, false);
  }

  body = '{"POWER":"ON"}';
  result = await requestLocalDevice({ base:'http://127.0.0.1', command:'/power-on', expectedState:'on' });
  assert.equal(result.observedState, 'on');
  assert.equal(result.success, true);
  assert.equal(result.verified, true);
});

test('device control never persists or completes an unverified requested state', async () => {
  const owner = 'owner@test';
  const device = { id:'lamp-1', name:'Lámpa', created_by:owner, status:'off', api_url:'http://127.0.0.1' };
  const updates = [];
  const logs = [];
  const requests = [];
  let sceneUpdates = 0;
  let routineUpdates = 0;
  let bridgeResponse = { success:true, transportSuccess:true, verified:false, observedState:'off', data:{ POWER:'OFF' } };

  const context = {
    jarvis: {
      auth: { me: async () => ({ email:owner }) },
      entities: {
        SmartDevice: {
          filter: async () => [device],
          update: async (_id, patch) => { updates.push(patch); return { ...device, ...patch }; },
        },
        ActionLog: { create: async (entry) => { logs.push(entry); return entry; } },
        Scene: {
          filter: async () => [{ id:'scene-1', name:'Este', created_by:owner, actions:[{ type:'device', device:'Lámpa', command:'on' }] }],
          update: async () => { sceneUpdates += 1; },
        },
        Routine: {
          filter: async () => [{ id:'routine-1', name:'Reggel', created_by:owner, steps:[{ tool:'control_device', params:{ device_name:'Lámpa', command:'on' } }] }],
          update: async () => { routineUpdates += 1; },
        },
      },
    },
    window: {
      jarvisDesktop: {
        localDeviceRequest: async (request) => {
          requests.push(request);
          return bridgeResponse;
        },
      },
    },
  };

  const tools = loadScript('src/lib/environmentTools.js', context, 'ENV_TOOLS');

  let result = await tools.control_device({ device_name:'Lámpa', command:'on' });
  assert.equal(result.success, false);
  assert.equal(result.data.verified, false);
  assert.equal(updates.length, 0);
  assert.equal(logs.at(-1).status, 'failed');
  assert.equal(requests.at(-1).expectedState, 'on');

  bridgeResponse = { success:true, transportSuccess:true, verified:true, observedState:'on', data:{ POWER:'ON' } };
  result = await tools.control_device({ device_name:'Lámpa', command:'off' });
  assert.equal(result.success, false);
  assert.equal(updates.length, 0);
  assert.equal(logs.at(-1).status, 'failed');
  assert.equal(requests.at(-1).expectedState, 'off');

  bridgeResponse = { success:true, transportSuccess:true, data:{} };
  result = await tools.control_device({ device_name:'Lámpa', command:'on' });
  assert.equal(result.success, false);
  assert.equal(updates.length, 0);

  bridgeResponse = { success:true, transportSuccess:true, verified:true, observedState:'on', data:{ POWER:'ON' } };
  result = await tools.control_device({ device_name:'Lámpa', command:'on' });
  assert.equal(result.success, true);
  assert.equal(result.data.verified, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, 'on');
  assert.equal(logs.at(-1).status, 'completed');

  bridgeResponse = { success:true, transportSuccess:true, verified:false, observedState:'off', data:{ POWER:'OFF' } };
  assert.equal((await tools.trigger_scene({ scene_name:'Este' })).success, false);
  assert.equal((await tools.run_routine({ routine_name:'Reggel' })).success, false);
  assert.equal(sceneUpdates, 0);
  assert.equal(routineUpdates, 0);
});

function voiceHarness(getUserMedia) {
  const timers = [];
  const errors = [];
  class FakeMediaRecorder {}
  const context = {
    Blob,
    performance,
    MediaRecorder: FakeMediaRecorder,
    console: { info() {} },
    window: {
      MediaRecorder: FakeMediaRecorder,
      setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; },
      clearTimeout() {},
      setInterval() { return 1; },
      clearInterval() {},
      jarvisDesktop: { capabilities:{ recordedStt:true } },
    },
    navigator: { onLine:true, mediaDevices:{ getUserMedia } },
    jarvis: { functions:{ invoke:async () => ({ data:{ text:'' } }) } },
    computeSpeechThreshold: () => 0.02,
    hasLiveAudioTrack: (stream) => Boolean(stream?.getAudioTracks?.().some((track) => track.readyState === 'live')),
    isLikelySilenceTranscript: () => false,
    microphoneErrorMessage: (error) => error?.message || 'microphone error',
    updateNoiseFloor: (value) => value,
    startLipSyncFromAudioElement() {},
    stopLipSync() {},
  };
  const createRecordedVoiceIO = loadScript('src/lib/mobileVoiceIO.js', context, 'createRecordedVoiceIO');
  const io = createRecordedVoiceIO({ onError:(error) => errors.push(error) });
  return { io, timers, errors };
}

function fakeStream() {
  const listeners = new Map();
  const track = {
    readyState:'live',
    stop() { this.readyState = 'ended'; },
    addEventListener(type, handler) { listeners.set(type, handler); },
    emit(type) { listeners.get(type)?.(); },
  };
  return {
    track,
    getTracks: () => [track],
    getAudioTracks: () => [track],
  };
}

test('late rejection from an old microphone segment cannot stop the new capture', async () => {
  const staleRequest = deferred();
  const firstStream = fakeStream();
  const newStream = fakeStream();
  let calls = 0;

  const h = voiceHarness(() => {
    calls += 1;
    if (calls === 1) return Promise.resolve(firstStream);
    if (calls === 2) return staleRequest.promise;
    if (calls === 3) return Promise.resolve(newStream);
    throw new Error('unexpected getUserMedia call');
  });

  assert.equal(await h.io.startContinuous(), true);
  firstStream.track.emit('ended');
  assert.ok(h.timers.length >= 1);

  const staleSegment = h.timers.shift().fn();
  await tick();
  assert.equal(calls, 2);

  h.io.stopContinuous();
  assert.equal(await h.io.startContinuous(), true);
  assert.equal(calls, 3);
  assert.equal(newStream.track.readyState, 'live');

  staleRequest.reject(Object.assign(new Error('old permission denial'), { name:'NotAllowedError' }));
  await staleSegment;
  await tick();

  assert.equal(newStream.track.readyState, 'live');
  assert.equal(h.errors.some((error) => error.type === 'microphone_denied'), false);

  h.io.stopContinuous();
  assert.equal(newStream.track.readyState, 'ended');
});

test('current microphone permission failure still reports microphone_denied', async () => {
  const h = voiceHarness(() => Promise.reject(Object.assign(new Error('permission denied'), { name:'NotAllowedError' })));
  assert.equal(await h.io.startContinuous(), false);
  assert.equal(h.errors.at(-1)?.type, 'microphone_denied');
});

function routeHarness({ maxRetries = 5, onlineInitially = true } = {}) {
  let now = 1000;
  let online = onlineInitially;
  let timerId = 0;
  let timers = [];
  let queue = [];
  let remote = null;
  let createAttempts = 0;
  const operations = [];
  let failCreate = true;

  class Clock extends Date {
    static now() { return now; }
  }

  const context = {
    Date:Clock,
    CONFIG:{ ROUTE_QUEUE_MAX_RETRIES:maxRetries, ROUTE_QUEUE_BACKOFF_MS:10 },
    networkMonitor:{ isOnline:() => online },
    getOfflineQueue:() => structuredClone(queue),
    enqueueOfflineAction:(action) => {
      const entry = { id:`q-${queue.length + 1}`, createdAt:now, ...action };
      queue.push(entry);
      return entry;
    },
    updateOfflineAction:(id, updater) => {
      queue = queue.map((item) => item.id === id ? updater(item) : item);
    },
    removeOfflineAction:(id) => { queue = queue.filter((item) => item.id !== id); },
    saveRouteSnapshot() {},
    setRouteTrackingState() {},
    setTimeout(fn, delay) {
      const id = ++timerId;
      timers.push({ id, fn, delay });
      return id;
    },
    clearTimeout(id) {
      timers = timers.filter((timer) => timer.id !== id);
    },
    jarvis:{
      auth:{ me:async () => ({ email:'owner@test' }) },
      entities:{
        RouteHistory:{
          filter:async () => remote ? [remote] : [],
          create:async (payload) => {
            operations.push('start');
            createAttempts += 1;
            if (failCreate) {
              failCreate = false;
              throw new Error('temporary');
            }
            remote = { id:'remote-1', ...payload };
            return remote;
          },
          update:async (_id, patch) => {
            operations.push(patch.end_time ? 'end' : 'update');
            remote = { ...remote, ...patch };
            return remote;
          },
        },
      },
    },
  };

  const api = loadScript(
    'src/lib/routeOfflineQueue.js',
    context,
    '({syncRouteQueue,restoreRouteQueueSync,retryFailedRouteSync,pauseRouteQueueSync})',
  );

  return {
    api,
    operations,
    get queue() { return queue; },
    set queue(value) { queue = value; },
    get timers() { return timers; },
    get createAttempts() { return createAttempts; },
    setOnline(value) { online = value; },
    advance(ms) { now += ms; },
  };
}

test('route sync retries automatically after backoff and preserves start-update-end order', async () => {
  const h = routeHarness();
  h.queue = [
    { id:'start', type:'route_start', local_id:'r1', payload:{ local_id:'r1' }, retry_count:0, status:'pending' },
    { id:'update', type:'route_update', local_id:'r1', payload:{ local_id:'r1', notes:'point' }, retry_count:0, status:'pending' },
    { id:'end', type:'route_end', local_id:'r1', payload:{ local_id:'r1', end_time:'2026-10-06T10:00:00Z' }, retry_count:0, status:'pending' },
  ];

  await h.api.syncRouteQueue();
  assert.deepEqual(h.operations, ['start']);
  assert.equal(h.queue[0].retry_count, 1);
  assert.equal(h.queue[0].status, 'pending');
  assert.equal(h.queue[1].retry_count, 0);
  assert.equal(h.timers.length, 1);
  assert.ok(h.timers[0].delay >= 10);

  const retry = h.timers[0];
  h.advance(retry.delay);
  retry.fn();
  for (let i = 0; i < 8 && h.queue.length > 0; i += 1) await tick();

  assert.deepEqual(h.operations, ['start', 'start', 'update', 'end']);
  assert.equal(h.createAttempts, 2);
  assert.equal(h.queue.length, 0);
});

test('route sync does not consume retry budget after connection becomes offline', async () => {
  const h = routeHarness();
  h.queue = [{ id:'start', type:'route_start', local_id:'r2', payload:{ local_id:'r2' }, retry_count:0, status:'pending' }];

  // Flip network state during the failing write so the catch path sees offline.
  const original = h.api.syncRouteQueue;
  h.setOnline(true);
  const contextSource = source('src/lib/routeOfflineQueue.js');
  assert.match(contextSource, /if \(!networkMonitor\.isOnline\(\)\) \{[\s\S]*?retry_count/);

  // Rebuild a focused harness whose create call drops the network before failing.
  let online = true;
  let queue = structuredClone(h.queue);
  const api = loadScript('src/lib/routeOfflineQueue.js', {
    Date,
    CONFIG:{ ROUTE_QUEUE_MAX_RETRIES:5, ROUTE_QUEUE_BACKOFF_MS:10 },
    networkMonitor:{ isOnline:() => online },
    getOfflineQueue:() => structuredClone(queue),
    enqueueOfflineAction:() => null,
    updateOfflineAction:(id, updater) => { queue = queue.map((item) => item.id === id ? updater(item) : item); },
    removeOfflineAction:(id) => { queue = queue.filter((item) => item.id !== id); },
    saveRouteSnapshot() {},
    setRouteTrackingState() {},
    setTimeout:() => 1,
    clearTimeout() {},
    jarvis:{
      auth:{ me:async () => ({ email:'owner@test' }) },
      entities:{ RouteHistory:{
        filter:async () => [],
        create:async () => { online = false; throw new Error('offline'); },
        update:async () => null,
      } },
    },
  }, '({syncRouteQueue})');

  await api.syncRouteQueue();
  assert.equal(queue[0].retry_count, 0);
  assert.equal(queue[0].status, 'pending');
  assert.equal(queue[0].next_retry_at, null);
  void original;
});

test('route retry limit keeps data for manual recovery and restart restores interrupted work', async () => {
  const h = routeHarness({ maxRetries:1 });
  h.queue = [{ id:'start', type:'route_start', local_id:'r3', payload:{ local_id:'r3' }, retry_count:0, status:'pending' }];
  await h.api.syncRouteQueue();
  assert.equal(h.queue.length, 1);
  assert.equal(h.queue[0].status, 'failed');
  assert.equal(h.timers.length, 0);

  const restored = routeHarness();
  restored.queue = [{ id:'start', type:'route_start', local_id:'r4', payload:{ local_id:'r4' }, retry_count:0, status:'syncing' }];
  restored.api.restoreRouteQueueSync();
  assert.equal(restored.queue[0].status, 'pending');
  assert.equal(restored.timers.length, 1);

  const navigation = source('src/lib/navigationTracker.js');
  assert.match(navigation, /restoreRouteQueueSync\(\)/);
  assert.match(navigation, /else pauseRouteQueueSync\(\)/);
  assert.match(navigation, /unsubscribe\(\);[\s\S]*?pauseRouteQueueSync\(\);[\s\S]*?stopRouteTracking\(\);/);
});

test('user-facing tool-like JSON survives sanitization, including repeated filtering', () => {
  const examples = [
    '{"tool":"kalapács","params":{"anyag":"fa"}}',
    '{"tool_calls":[]}',
    '```json\n{"tool":"kalapács","params":{"anyag":"fa"}}\n```',
    '```json\n{"tool_calls":[]}\n```',
  ];

  for (const example of examples) {
    assert.equal(sanitizeAssistantText(example), example);
    assert.equal(sanitizeAssistantText(sanitizeAssistantText(example)), example);
  }
});

test('only trusted internal action context is filtered and plain JSON never becomes executable', () => {
  const visible = 'Magyarázat\n```actions\n[{"tool":"create_note","params":{"title":"x"}}]\n```';
  assert.equal(sanitizeAssistantText(visible), 'Magyarázat');
  assert.equal(
    sanitizeAssistantText('{"tool":"create_note","params":{}}', SAFE_ASSISTANT_FALLBACK, { internalPayload:true }),
    SAFE_ASSISTANT_FALLBACK,
  );
  assert.equal(isInternalAssistantOperationEnvelope({ data:{ tool_calls:[] } }), true);
  assert.equal(isInternalAssistantOperationEnvelope({ data:{ actionResults:[] } }), true);
  assert.equal(isInternalAssistantOperationEnvelope({ data:{ actions:[] } }), true);
  assert.equal(isInternalAssistantOperationEnvelope({ data:{ result:'{"tool_calls":[]}' } }), false);

  const assistantTools = source('src/lib/assistantTools.js');
  const start = assistantTools.indexOf('export function parseActions(');
  const end = assistantTools.indexOf('/**\n * Execute parsed actions', start);
  const parseActions = vm.runInNewContext(
    assistantTools.slice(start, end).replace(/export /g, '') + ';parseActions',
    { validateAction:() => true, logger:{ warn() {} }, JSON },
  );

  assert.deepEqual(parseActions('{"tool":"create_note","params":{}}'), []);
  assert.deepEqual(parseActions('```json\n{"tool":"create_note","params":{}}\n```'), []);
  assert.equal(parseActions('```actions\n[{"tool":"create_note","params":{}}]\n```').length, 1);
});

test('normalization preserves user JSON but blocks structured internal tool envelopes', () => {
  let normalizeSource = source('src/lib/normalizeAssistantReply.js')
    .replace(/^import .*;\n/gm, '')
    .replace(/export default /g, '')
    .replace(/export /g, '')
    .replace(/\s*if \(import\.meta\.env\?\.DEV\)[^\n]*\n/g, '\n');

  const normalizeAssistantReply = vm.runInNewContext(
    normalizeSource + ';normalizeAssistantReply',
    {
      sanitizeAssistantText,
      SAFE_ASSISTANT_FALLBACK,
      isInternalAssistantOperationEnvelope,
      console:{ info() {} },
    },
  );

  const example = '{"tool":"kalapács","params":{"anyag":"fa"}}';
  assert.equal(normalizeAssistantReply({ data:{ result:example } }), example);
  assert.equal(normalizeAssistantReply({ data:{ result:'```json\n{"tool_calls":[]}\n```' } }), '```json\n{"tool_calls":[]}\n```');
  assert.equal(normalizeAssistantReply({ data:{ tool_calls:[] } }), SAFE_ASSISTANT_FALLBACK);

  const codeAssistant = source('src/lib/codeAssistant.js');
  assert.doesNotMatch(codeAssistant, /sanitizeAssistantText\(normalizeAssistantReply\(response\)\)/);
});
