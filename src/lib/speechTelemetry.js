/**
 * Speech System Telemetry — production edition.
 * Tracks restarts, queue events, errors, network changes, self-heals, fallbacks.
 * All in-memory — resets on page reload.
 */

const state = {
  restartCount:       0,
  watchdogFires:      0,
  queueOverflows:     0,
  workerErrors:       0,
  ttsConflicts:       0,
  networkChanges:     0,   // online/offline transitions
  fallbackActivations:0,   // degraded mode activations
  selfHealEvents:     0,   // self-heal triggers
  lastRestartReason:  null,
  lastRestartTime:    null,
  lastActiveTime:     null,
  lastHealReason:     null,
  lastNetworkEvent:   null, // 'online' | 'offline'
  sessionStartTime:   Date.now(),
  latencies:          [],   // last N LLM latencies in ms
  degradedMode:       false,
  lastLatencyWarningAt: 0,
};

const MAX_LATENCIES = 20;

export const telemetry = {
  recordRestart(reason) {
    state.restartCount++;
    state.lastRestartReason = reason;
    state.lastRestartTime = Date.now();
    console.info(`[Speech] Restart #${state.restartCount} — reason: ${reason}`);
  },

  recordWatchdog() {
    state.watchdogFires++;
    console.warn(`[Speech] Watchdog fired #${state.watchdogFires}`);
  },

  recordQueueOverflow() {
    state.queueOverflows++;
    console.warn(`[Speech] Queue overflow #${state.queueOverflows}`);
  },

  recordWorkerError() {
    state.workerErrors++;
  },

  recordTTSConflict() {
    state.ttsConflicts++;
  },

  recordActivity() {
    state.lastActiveTime = Date.now();
  },

  recordLatency(ms) {
    state.latencies.push(ms);
    if (state.latencies.length > MAX_LATENCIES) state.latencies.shift();
  },

  recordNetworkChange(online) {
    state.networkChanges++;
    state.lastNetworkEvent = online ? 'online' : 'offline';
  },

  recordFallback() {
    state.fallbackActivations++;
    state.degradedMode = true;
    console.warn(`[Speech] Fallback mode activated #${state.fallbackActivations}`);
  },

  clearFallback() {
    state.degradedMode = false;
  },

  recordSelfHeal(reason) {
    state.selfHealEvents++;
    state.lastHealReason = reason;
    console.warn(`[Speech] Self-heal #${state.selfHealEvents} — ${reason}`);
  },

  isDegraded() {
    return state.degradedMode;
  },

  avgLatency() {
    if (!state.latencies.length) return 0;
    const avg = Math.round(state.latencies.reduce((a, b) => a + b, 0) / state.latencies.length);
    // FIX #12: Warn if latency exceeds 3s
    if (avg > 3000 && Date.now() - state.lastLatencyWarningAt > 10000) {
      state.lastLatencyWarningAt = Date.now();
      console.warn(`[Telemetry] High latency detected: ${avg}ms`);
    }
    return avg;
  },

  getSnapshot() {
    return {
      ...state,
      uptimeMs:     Date.now() - state.sessionStartTime,
      avgLatencyMs: this.avgLatency(),
    };
  },
};

export default telemetry;