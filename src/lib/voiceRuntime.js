/**
 * Centralized Voice Runtime — single source of truth for all speech I/O.
 *
 * Responsibilities:
 * - SpeechRecognition lifecycle (start/stop/restart)
 * - Watchdog monitoring
 * - Transcript queue coordination
 * - TTS conflict management
 * - State management (hands-free, listening, speaking)
 * - Telemetry & self-healing
 * - Network awareness & degraded mode
 *
 * Pattern: Singleton + EventEmitter
 * Components subscribe to state changes, never manage audio directly.
 */

import { CONFIG } from '@/lib/appConfig';
import { logger } from '@/lib/logger';
import { telemetry } from '@/lib/speechTelemetry';
import { networkMonitor } from '@/lib/networkMonitor';
import { selfHealingMonitor } from '@/lib/selfHealingMonitor';
import { SpeechWatchdog } from '@/lib/speechWatchdog';
import { createTranscriptQueue } from '@/lib/transcriptQueue';
import { useVoiceStore } from '@/lib/appStore';
import { createRecordedVoiceIO, canUseRecordedVoiceIO, playLocalAckTone } from '@/lib/mobileVoiceIO';
import { safeStorage } from '@/lib/safeStorage';

const MIN_RESTART_DELAY_MS = 750;
const HANDS_FREE_RESTART_DELAY_MS = 180;
const VOICE_PHASE = {
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  PROCESSING: 'PROCESSING',
  SPEAKING: 'SPEAKING',
  ERROR: 'ERROR',
};

function toPhase(value) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'TTS_PENDING') return VOICE_PHASE.SPEAKING;
  return VOICE_PHASE[normalized] || VOICE_PHASE.IDLE;
}

function toUiPhase(value) {
  return String(value || VOICE_PHASE.IDLE).toLowerCase();
}

function devVoiceLog(event, meta = {}) {
  if (import.meta.env?.DEV) console.info(event, meta);
}

const MODULE = 'voiceRuntime';

function isAndroidDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

function isAndroidMobileWebView() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isWebView = /; wv\)|\bwv\b|Version\/\d+(?:\.\d+)?\s+Chrome\//i.test(ua);
  return isAndroidDevice() && isWebView;
}

function canUseBrowserSpeechRuntime() {
  if (typeof window === 'undefined') return false;
  if (isAndroidDevice()) return false;
  if (isAndroidMobileWebView()) return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function getVoiceInputMode() {
  if (canUseBrowserSpeechRuntime()) return 'browser';
  if (canUseRecordedVoiceIO()) return 'recorded';
  return 'unsupported';
}

function canUseBrowserTTS() {
  if (typeof window === 'undefined') return false;
  if (isAndroidMobileWebView()) return false;
  return 'speechSynthesis' in window;
}

// ─── STATE MACHINE ────────────────────────────────────────────────────────────
class VoiceRuntimeState {
  constructor() {
    this.machineState = VOICE_PHASE.IDLE;
    this.phase = 'idle';
    this.handsFree = false;
    this.isListening = false;
    this.isRecognitionActive = false;
    this.isRecognitionStarting = false;
    this.isSpeaking = false;
    this.isOnline = true;
    this.degradedMode = false;
    this.recognitionLang = 'hu-HU';
    this.autoSpeakReplies = safeStorage.getItem('autoSpeakReplies') !== 'false';
    this.voiceInputMode = getVoiceInputMode();
    this.isSpeechInputSupported = this.voiceInputMode !== 'unsupported';
    this.isTtsSupported = canUseBrowserTTS() || this.voiceInputMode === 'recorded';
    this.mobileWebViewSpeechDisabled = false;
  }
}

function resolveVoicePhase(currentPhase, updates) {
  if ('machineState' in updates) return toUiPhase(updates.machineState);
  if ('phase' in updates) return toUiPhase(toPhase(updates.phase));
  if (updates.isSpeaking === true) return 'speaking';
  if (updates.isRecognitionActive === true || updates.isRecognitionStarting === true || updates.isListening === true) return 'listening';
  return currentPhase;
}

// ─── SINGLETON RUNTIME ────────────────────────────────────────────────────────
class VoiceRuntime {
  constructor() {
    this.state = new VoiceRuntimeState();
    this.recognitionRef = null;
    this.recordedVoiceRef = null;
    this.watchdogRef = null;
    this.ttsUtteranceRef = null;
    this.restartTimeoutRef = null;
    this.ttsTimeoutRef = null;
    this.voicesLoadedRef = false;
    this.didWarmupRef = false;
    this.restartAllowedRef = true;
    this.lastRecognitionEndRef = 0;
    this.lastRestartAtRef = 0;
    this.recognitionStateRef = { isActive: false, isStarting: false };
    this.voiceCycleLockedRef = false;
    this.singleCycleActiveRef = false;
    this.cycleTimeoutRef = null;
    this.ttsInFlightRef = false;
    this.ttsRestartConsumedRef = false;
    this.languageLockRef = 'hu-HU';
    this.networkErrorCountRef = 0;
    this.networkCooldownUntilRef = 0;
    this.transcriptQueue = createTranscriptQueue();

    // Event subscribers
    this.subscribers = new Map(); // event -> Set(callbacks)

    if (this.state.voiceInputMode === 'recorded') {
      this.recordedVoiceRef = createRecordedVoiceIO({
        onTranscript: (transcript) => {
          if (![VOICE_PHASE.LISTENING, VOICE_PHASE.PROCESSING].includes(this.state.machineState)) {
            logger.warn(MODULE, 'Duplicate recorded transcript ignored', { phase: this.state.phase });
            return;
          }
          useVoiceStore.getState().setLastTranscript(transcript);
          this._updateState({ machineState: VOICE_PHASE.PROCESSING, isListening: false, isRecognitionActive: false, isRecognitionStarting: false });
          this._emit('transcript', transcript);
          this.transcriptQueue.push(transcript);
        },
        onError: (error) => {
          useVoiceStore.getState().setLastError(error);
          this._emit('error', error);
          this._updateState({ machineState: VOICE_PHASE.ERROR, isListening: false, isRecognitionActive: false, isRecognitionStarting: false });
        },
        onStateChange: (updates) => this._updateState(updates),
      });
    }

    this._initNetworkMonitoring();
    this._initVisibilityHandling();
    this._initSelfHealing();
    this._initSpeechSynthesis();
    this._buildRecognition();

    logger.info(MODULE, 'Voice runtime initialized');
  }

  // ─── EVENT SYSTEM ─────────────────────────────────────────────────────────
  subscribe(event, callback) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }
    this.subscribers.get(event).add(callback);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(event).delete(callback);
    };
  }

  _emit(event, data) {
    const callbacks = this.subscribers.get(event);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          logger.error(MODULE, `Event callback failed: ${event}`, { err: err?.message });
        }
      });
    }
  }

  _updateState(updates) {
    const nextUpdates = { ...updates };
    nextUpdates.machineState = toPhase(nextUpdates.machineState || nextUpdates.phase || this.state.machineState);
    nextUpdates.phase = resolveVoicePhase(this.state.phase, nextUpdates);

    if (nextUpdates.phase === 'idle') {
      nextUpdates.isListening = false;
      nextUpdates.isRecognitionActive = false;
      nextUpdates.isRecognitionStarting = false;
      nextUpdates.isSpeaking = false;
    }
    if (nextUpdates.phase === 'processing') {
      nextUpdates.isListening = false;
      nextUpdates.isRecognitionActive = false;
      nextUpdates.isRecognitionStarting = false;
      nextUpdates.isSpeaking = false;
    }
    if (nextUpdates.phase === 'speaking') {
      nextUpdates.isListening = false;
      nextUpdates.isRecognitionActive = false;
      nextUpdates.isRecognitionStarting = false;
      nextUpdates.isSpeaking = true;
    }
    if (nextUpdates.phase === 'listening') {
      nextUpdates.isSpeaking = false;
    }

    const changed = {};
    for (const [key, val] of Object.entries(nextUpdates)) {
      if (this.state[key] !== val) {
        changed[key] = val;
        this.state[key] = val;
      }
    }
    if (Object.keys(changed).length > 0) {
      logger.debug(MODULE, 'State transition', { phase: this.state.phase, changed });
      useVoiceStore.getState().setPhase(this.state.phase);
      useVoiceStore.getState().setHandsFree(this.state.handsFree);
      this._emit('stateChange', changed);
    }
  }

  // ─── INITIALIZATION ───────────────────────────────────────────────────────
  _initNetworkMonitoring() {
    networkMonitor.subscribe((online) => {
      this._updateState({ isOnline: online });
      if (!online) {
        this.transcriptQueue.pause();
        this._updateState({ degradedMode: true });
        telemetry.recordFallback();
      } else {
        this.transcriptQueue.resume();
        this._updateState({ degradedMode: false });
        telemetry.clearFallback();
      }
    });
  }

  _initVisibilityHandling() {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.restartAllowedRef = false;
        this._stopRecognition(false);
        this._cancelTTS();
        if (this.restartTimeoutRef) clearTimeout(this.restartTimeoutRef);
        logger.debug(MODULE, 'MIC_RESTART_BLOCKED', { reason: 'app-backgrounded' });
        devVoiceLog('MIC_RESTART_BLOCKED', { reason: 'app-backgrounded' });
        return;
      }
      this.restartAllowedRef = this.state.handsFree;
      if (this.state.handsFree) this._scheduleRestart(MIN_RESTART_DELAY_MS);
    });
  }

  _initSelfHealing() {
    selfHealingMonitor.setHealCallback((reason) => {
      logger.info(MODULE, `Self-healing triggered: ${reason}`);
      if (!this._canRestartRecognition()) {
        return;
      }
      this._stopRecognition();
      this.transcriptQueue.clear();
      this.recognitionStateRef = { isActive: false, isStarting: false };
      this.recognitionRef = null;
      this._buildRecognition();
      this._safeStartRecognition();
    });
  }

  _initSpeechSynthesis() {
    if (!canUseBrowserTTS()) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices?.() || [];
      this.voicesLoadedRef = voices.length > 0;
    };
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
  }

  _isProtectedAudioPhase() {
    return this.state.machineState === VOICE_PHASE.SPEAKING
      || this.state.machineState === VOICE_PHASE.PROCESSING
      || this.state.phase === 'speaking'
      || this.state.phase === 'processing'
      || this.state.phase === 'tts_pending'
      || this.state.isSpeaking;
  }

  _canRestartRecognition() {
    const staleTts = !this.ttsInFlightRef && !this.ttsUtteranceRef && window.speechSynthesis?.speaking;
    if (staleTts && !this._isProtectedAudioPhase()) {
      try { window.speechSynthesis.cancel(); } catch {}
    }

    const blocked = !this.state.isSpeechInputSupported
      || !this.state.handsFree
      || !this.restartAllowedRef
      || this._isProtectedAudioPhase()
      || Date.now() < this.networkCooldownUntilRef
      || !!this.ttsUtteranceRef
      || (!!window.speechSynthesis?.speaking && !staleTts);

    if (blocked) {
      if (this._isProtectedAudioPhase()) {
        logger.debug(MODULE, 'WATCHDOG_BLOCKED_DURING_SPEAKING', { phase: this.state.phase });
        devVoiceLog('WATCHDOG_BLOCKED_DURING_SPEAKING', { phase: this.state.phase });
      } else {
        logger.debug(MODULE, 'RESTART_BLOCKED_STATE', {
          handsFree: this.state.handsFree,
          restartAllowed: this.restartAllowedRef,
          phase: this.state.phase,
          ttsActive: !!this.ttsUtteranceRef || !!window.speechSynthesis?.speaking,
        });
      }
    }

    return !blocked;
  }

  _warmupTTS() {
    if (this.didWarmupRef || !('speechSynthesis' in window)) return;
    this.didWarmupRef = true;
    const warmup = new SpeechSynthesisUtterance(' ');
    warmup.volume = 0;
    warmup.rate = 1;
    warmup.pitch = 1;
    try {
      window.speechSynthesis.speak(warmup);
      window.setTimeout(() => window.speechSynthesis.cancel(), 50);
    } catch {}
  }

  // ─── RECOGNITION LIFECYCLE ────────────────────────────────────────────────
  _buildRecognition() {
    if (this.recognitionRef) return this.recognitionRef;
    if (!canUseBrowserSpeechRuntime()) return null;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;

    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = this.state.recognitionLang;

    r.onstart = () => {
      if (!this.singleCycleActiveRef && !this._canRestartRecognition()) {
        logger.debug(MODULE, 'RESTART_BLOCKED_STATE', { reason: 'late-onstart-during-protected-phase', phase: this.state.phase });
        this.recognitionStateRef = { isActive: false, isStarting: false };
        try { this.recognitionRef?.abort(); } catch {}
        this._updateState({ isRecognitionActive: false, isRecognitionStarting: false, isListening: false });
        return;
      }

      this.recognitionStateRef.isActive = true;
      this.recognitionStateRef.isStarting = false;
      logger.debug(MODULE, 'MIC_STARTED');
      devVoiceLog('MIC_STARTED', { lang: this.languageLockRef });
      this._updateState({ machineState: VOICE_PHASE.LISTENING, isRecognitionActive: true, isRecognitionStarting: false, isListening: true });
      this.watchdogRef?.heartbeat();
      telemetry.recordActivity();
    };

    r.onresult = (e) => {
      const isFinal = e.results[e.results.length - 1].isFinal;
      const transcript = e.results?.[e.results.length - 1]?.[0]?.transcript?.trim();
      if (!transcript || !isFinal) return;
      if (this.state.phase !== 'listening') {
        logger.warn(MODULE, 'Duplicate browser transcript ignored', { phase: this.state.phase });
        return;
      }

      this._cancelTTS();
      if (this.restartTimeoutRef) clearTimeout(this.restartTimeoutRef);
      this.networkErrorCountRef = 0;
      this.networkCooldownUntilRef = 0;
      this.watchdogRef?.heartbeat();
      logger.debug(MODULE, 'Transcript received', { lang: this.languageLockRef });
      useVoiceStore.getState().setLastTranscript(transcript);
      this._emit('transcript', transcript);
      this.transcriptQueue.push(transcript);

      // Browser SpeechRecognition is already configured with continuous=true.
      // In hands-free mode do not stop the microphone after every final phrase:
      // keep the recognition session alive while the assistant processes text.
      if (!this.state.handsFree || this.singleCycleActiveRef) {
        this._stopRecognition(true);
        this._updateState({ machineState: VOICE_PHASE.PROCESSING });
      } else {
        this._updateState({ machineState: VOICE_PHASE.LISTENING, isListening: true, isRecognitionActive: true, isRecognitionStarting: false });
        logger.debug(MODULE, 'MIC_CONTINUOUS_SESSION', { reason: 'final-transcript' });
      }
    };

    r.onend = () => {
      this.recognitionStateRef.isActive = false;
      this.recognitionStateRef.isStarting = false;
      this.lastRecognitionEndRef = Date.now();
      logger.debug(MODULE, 'MIC_STOPPED');
      devVoiceLog('MIC_STOPPED', { phase: this.state.phase });
      this._updateState({ isRecognitionActive: false, isRecognitionStarting: false, isListening: false, machineState: this._isProtectedAudioPhase() ? this.state.machineState : VOICE_PHASE.IDLE });
      this.watchdogRef?.heartbeat();
      if (this._canRestartRecognition()) {
        this._scheduleRestart(this.state.handsFree ? HANDS_FREE_RESTART_DELAY_MS : MIN_RESTART_DELAY_MS, 'recognition_end');
      }
    };

    r.onerror = (e) => {
      this.recognitionStateRef.isActive = false;
      this.recognitionStateRef.isStarting = false;
      logger.warn(MODULE, 'Mic error', { error: e.error });

      if (this._isProtectedAudioPhase() || !this.restartAllowedRef) {
        logger.debug(MODULE, 'RESTART_BLOCKED_STATE', { reason: 'recognition-error-during-protected-phase', error: e.error, phase: this.state.phase });
        this._updateState({ isRecognitionActive: false, isRecognitionStarting: false, isListening: false });
        return;
      }

      this._updateState({ phase: 'idle', isRecognitionActive: false, isRecognitionStarting: false, isListening: false });
      if (!this.state.handsFree) {
        logger.debug(MODULE, 'MIC_RESTART_SKIPPED', { reason: 'hands-free-disabled', error: e.error });
        return;
      }

      if (e.error === 'aborted') {
        logger.debug(MODULE, 'MIC_RESTART_SKIPPED', { reason: 'intentional-abort' });
        return;
      }

      const recoverableErrors = ['no-speech', 'audio-capture', 'network'];
      if (recoverableErrors.includes(e.error)) {
        logger.warn(MODULE, `Recoverable error: ${e.error}`);
        telemetry.recordRestart(`error_${e.error}`);
        selfHealingMonitor.recordRestart();
        const retryDelay = e.error === 'network'
          ? Math.min(30000, MIN_RESTART_DELAY_MS * (this.networkErrorCountRef + 1))
          : MIN_RESTART_DELAY_MS;
        if (e.error === 'network') {
          this.networkErrorCountRef += 1;
          this.networkCooldownUntilRef = Date.now() + retryDelay;
        }
        this._scheduleRestart(retryDelay, `error_${e.error}`);
      } else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        logger.error(MODULE, `Fatal: ${e.error}`);
        useVoiceStore.getState().setLastError({ type: 'microphone_denied', message: 'Mikrofon hozzáférés megtagadva' });
        this._emit('error', { type: 'microphone_denied', message: 'Mikrofon hozzáférés megtagadva' });
        this.setHandsFree(false);
      } else {
        logger.warn(MODULE, `Unhandled error: ${e.error}`);
        telemetry.recordRestart(`error_unhandled_${e.error}`);
        selfHealingMonitor.recordRestart();
        this._scheduleRestart(MIN_RESTART_DELAY_MS, 'unhandled_error');
      }
    };

    // Watchdog setup
    if (!this.watchdogRef) {
      this.watchdogRef = new SpeechWatchdog((reason) => {
        telemetry.recordRestart(reason);
        logger.warn(MODULE, `Watchdog restart: ${reason}`);
        if (!this._canRestartRecognition()) {
          return;
        }
        this._stopRecognition(true);
        this.recognitionRef = this._buildRecognition();
        if (this.state.handsFree && this._canRestartRecognition()) {
          logger.debug(MODULE, 'MIC_RESTART_ALLOWED', { reason });
          this._scheduleRestart(MIN_RESTART_DELAY_MS, reason);
        } else {
          logger.debug(MODULE, 'MIC_RESTART_SKIPPED', { reason: 'not-hands-free-or-blocked', handsFree: this.state.handsFree });
        }
      });
    }

    this.recognitionRef = r;
    return r;
    }

  _safeStartRecognition(forceSingle = false) {
    const elapsed = Date.now() - this.lastRestartAtRef;
    const blockedReason = this.state.machineState === VOICE_PHASE.SPEAKING ? 'speaking'
      : this.state.machineState === VOICE_PHASE.PROCESSING ? 'processing'
      : this.recognitionStateRef.isStarting ? 'already-starting'
      : this.recognitionStateRef.isActive || this.state.isListening ? 'already-listening'
      : !this.restartAllowedRef && !forceSingle ? 'restart-not-allowed'
      : elapsed < MIN_RESTART_DELAY_MS && !forceSingle ? 'restart-throttled'
      : !this.state.isSpeechInputSupported ? 'unsupported'
      : '';

    if (blockedReason) {
      logger.debug(MODULE, 'MIC_RESTART_BLOCKED', { reason: blockedReason, forceSingle, phase: this.state.phase, handsFree: this.state.handsFree, elapsed });
      devVoiceLog('MIC_RESTART_BLOCKED', { reason: blockedReason, phase: this.state.phase });
      return false;
    }

    const canStart = forceSingle
      ? this.state.isSpeechInputSupported && this.state.machineState === VOICE_PHASE.IDLE && !this.recognitionStateRef.isStarting && !this.recognitionStateRef.isActive && !this.state.isListening
      : this._canRestartRecognition();
    if (!canStart) {
      logger.debug(MODULE, 'MIC_RESTART_BLOCKED', { forceSingle, phase: this.state.phase, handsFree: this.state.handsFree });
      devVoiceLog('MIC_RESTART_BLOCKED', { reason: 'can-start-false', phase: this.state.phase });
      return false;
    }
    if (this.state.voiceInputMode === 'recorded') {
      logger.debug(MODULE, 'MIC_START_REQUEST', { forceSingle, lang: this.languageLockRef, mode: 'recorded' });
      devVoiceLog('MIC_START_REQUEST', { forceSingle, lang: this.languageLockRef, mode: 'recorded' });
      this.lastRestartAtRef = Date.now();
      this.ttsRestartConsumedRef = false;
      this._updateState({ machineState: VOICE_PHASE.LISTENING, isRecognitionStarting: true, isListening: false, recognitionLang: this.languageLockRef });
      this.recordedVoiceRef?.startContinuous().catch((error) => {
        const message = error?.message || 'A mikrofon indítása nem sikerült.';
        useVoiceStore.getState().setLastError({ type: 'recording_failed', message });
        this._emit('error', { type: 'recording_failed', message });
        this._updateState({ handsFree: false, machineState: VOICE_PHASE.ERROR, isListening: false, isRecognitionActive: false, isRecognitionStarting: false });
      });
      return true;
    }
    if (!this.recognitionRef) this.recognitionRef = this._buildRecognition();
    if (!this.recognitionRef) return false;

    const state = this.recognitionStateRef;
    if (state.isStarting || state.isActive || this.state.isListening) {
      logger.debug(MODULE, 'RESTART_BLOCKED_STATE', { reason: 'already-starting-or-listening' });
      return false;
    }

    try {
      if (isAndroidDevice()) {
        logger.warn(MODULE, 'Android browser recognition blocked to prevent restart loop');
        this.state.voiceInputMode = 'recorded';
        if (!this.recordedVoiceRef) {
          this.recordedVoiceRef = createRecordedVoiceIO({
            onTranscript: (transcript) => {
              if (this.state.machineState !== VOICE_PHASE.LISTENING) return;
              useVoiceStore.getState().setLastTranscript(transcript);
              this._updateState({ machineState: VOICE_PHASE.PROCESSING, isListening: false, isRecognitionActive: false, isRecognitionStarting: false });
              this._emit('transcript', transcript);
              this.transcriptQueue.push(transcript);
            },
            onError: (error) => {
              useVoiceStore.getState().setLastError(error);
              this._emit('error', error);
              this._updateState({ machineState: VOICE_PHASE.ERROR, isListening: false, isRecognitionActive: false, isRecognitionStarting: false });
            },
            onStateChange: (updates) => this._updateState(updates),
          });
        }
        this.watchdogRef?.stop();
        this.recognitionRef = null;
        return this._safeStartRecognition(forceSingle);
      }
      this.recognitionRef.continuous = !forceSingle && this.state.handsFree;
      this.recognitionRef.lang = this.languageLockRef || this.state.recognitionLang || 'hu-HU';
      this.recognitionStateRef.isStarting = true;
      logger.debug(MODULE, 'MIC_START_REQUEST', { forceSingle, lang: this.recognitionRef.lang, continuous: this.recognitionRef.continuous });
      devVoiceLog('MIC_START_REQUEST', { forceSingle, lang: this.recognitionRef.lang, continuous: this.recognitionRef.continuous });
      this.lastRestartAtRef = Date.now();
      this._updateState({ machineState: VOICE_PHASE.LISTENING, isRecognitionStarting: true, isListening: false, recognitionLang: this.recognitionRef.lang });
      this.recognitionRef.start();
      return true;
    } catch (err) {
      logger.warn(MODULE, 'safeStartRecognition failed', { err: err?.message });
      try { this.recognitionRef?.abort(); } catch {}
      this.recognitionStateRef = { isActive: false, isStarting: false };
      this.recognitionRef = null;
      this._updateState({ phase: this._isProtectedAudioPhase() ? this.state.phase : 'idle', isRecognitionStarting: false, isListening: false, isRecognitionActive: false });
      return false;
    }
  }

  _stopRecognition(useSoftStop = false) {
    if (this.state.voiceInputMode === 'recorded') {
      this.recordedVoiceRef?.stopContinuous();
      this.recognitionStateRef = { isActive: false, isStarting: false };
      this._updateState({ isRecognitionActive: false, isRecognitionStarting: false, isListening: false });
      this.transcriptQueue.clear();
      return;
    }
    try {
      if (useSoftStop) {
        this.recognitionRef?.stop();
      } else {
        this.recognitionRef?.abort();
      }
    } catch {}
    logger.debug(MODULE, 'MIC_STOPPED', { soft: useSoftStop });
    devVoiceLog('MIC_STOPPED', { soft: useSoftStop });
    this.recognitionStateRef = { isActive: false, isStarting: false };
    this._updateState({ isRecognitionActive: false, isRecognitionStarting: false, isListening: false });
    this.transcriptQueue.clear();
  }

  _scheduleRestart(delayMs = MIN_RESTART_DELAY_MS, reason = 'generic') {
    if (this.restartTimeoutRef) clearTimeout(this.restartTimeoutRef);
    if (this.state.voiceInputMode === 'recorded') return;
    if (!this.state.handsFree || !this.restartAllowedRef || this._isProtectedAudioPhase()) return;
    if (reason === 'tts_onend') {
      if (this.ttsRestartConsumedRef) return;
      this.ttsRestartConsumedRef = true;
    }

    const elapsed = Date.now() - this.lastRestartAtRef;
    const cooldownDelay = Math.max(0, this.networkCooldownUntilRef - Date.now());
    const safeDelay = Math.max(delayMs, cooldownDelay, MIN_RESTART_DELAY_MS - elapsed, 0);
    this.restartTimeoutRef = setTimeout(() => {
      this.networkCooldownUntilRef = 0;
      this._safeStartRecognition();
    }, safeDelay);
  }

  // ─── PUBLIC API ────────────────────────────────────────────────────────────
  startSingleCycle() {
    if (this.voiceCycleLockedRef || this.state.phase !== 'idle' || this.recognitionStateRef.isActive || this.recognitionStateRef.isStarting) {
      logger.warn(MODULE, 'VOICE_CYCLE_BLOCKED', { reason: 'cycle-already-active', phase: this.state.phase });
      return false;
    }

    this.voiceCycleLockedRef = true;
    this.singleCycleActiveRef = true;
    this.restartAllowedRef = false;
    this.languageLockRef = 'hu-HU';
    logger.info(MODULE, 'VOICE_CYCLE_START', { mode: 'single', languageLock: this.languageLockRef });
    this._updateState({ handsFree: false, machineState: VOICE_PHASE.IDLE, recognitionLang: this.languageLockRef });

    if (this.cycleTimeoutRef) clearTimeout(this.cycleTimeoutRef);
    this.cycleTimeoutRef = window.setTimeout(() => {
      if (this.voiceCycleLockedRef) {
        logger.warn(MODULE, 'VOICE_CYCLE_TIMEOUT_RESET', { phase: this.state.phase });
        useVoiceStore.getState().setLastError({ type: 'voice_timeout', message: 'A hangfeldolgozás túl sokáig tartott, újraindítottam.' });
        this._emit('error', { type: 'voice_timeout', message: 'A hangfeldolgozás túl sokáig tartott, újraindítottam.' });
        this.completeVoiceCycle(8000, 'timeout_reset');
      }
    }, 8000);

    const started = this._safeStartRecognition(true);
    if (!started) this.completeVoiceCycle(0, 'start_failed');
    return started;
  }

  completeVoiceCycle(latencyMs = 0, reason = 'completed') {
    if (this.cycleTimeoutRef) clearTimeout(this.cycleTimeoutRef);
    this.cycleTimeoutRef = null;
    logger.info(MODULE, 'VOICE_CYCLE_END', { latencyMs, reason, handsFree: this.state.handsFree });
    if (latencyMs > 5000) {
      useVoiceStore.getState().setLastError({ type: 'voice_latency', message: 'A hangválasz lassú volt, visszaálltam készenléti állapotba.' });
      this._emit('error', { type: 'voice_latency', message: 'A hangválasz lassú volt, visszaálltam készenléti állapotba.' });
    }
    this.voiceCycleLockedRef = false;
    this.singleCycleActiveRef = false;
    this.restartAllowedRef = this.state.handsFree;
    if (!this.state.handsFree) this._stopRecognition(false);
    this._updateState({ phase: 'idle', isListening: false, isSpeaking: false, isRecognitionActive: false, isRecognitionStarting: false });
  }

  setHandsFree(enabled) {
    if (enabled && this.state.voiceInputMode === 'recorded' && !navigator.onLine) {
      const message = 'Nincs internetkapcsolat, a hangvezérlés most nem indítható.';
      useVoiceStore.getState().setLastError({ type: 'network_offline', message });
      this._emit('error', { type: 'network_offline', message });
      return;
    }
    if (enabled && !this.state.isSpeechInputSupported) {
      this.restartAllowedRef = false;
      this._stopRecognition(true);
      const message = this.state.mobileWebViewSpeechDisabled
        ? 'Android WebView alatt a böngészős hangfelismerés ki van kapcsolva a stabilitás érdekében.'
        : 'A böngészős hangfelismerés nem támogatott ezen az eszközön.';
      useVoiceStore.getState().setLastError({ type: 'speech_unavailable', message });
      this._emit('error', { type: 'speech_unavailable', message });
      this._updateState({ handsFree: false, machineState: VOICE_PHASE.ERROR, isListening: false, isRecognitionActive: false, isRecognitionStarting: false });
      return;
    }
    if (enabled === this.state.handsFree) {
      if (enabled && !this.state.isListening && !this.recognitionStateRef.isActive && !this.recognitionStateRef.isStarting) {
        this.restartAllowedRef = true;
        this._cancelTTS();
        this._updateState({ machineState: VOICE_PHASE.IDLE, isListening: false, isSpeaking: false, isRecognitionActive: false, isRecognitionStarting: false });
        window.setTimeout(() => this._safeStartRecognition(), 150);
      }
      return;
    }

    this.restartAllowedRef = enabled;
    this.ttsRestartConsumedRef = false;
    this._updateState({ handsFree: enabled, machineState: VOICE_PHASE.IDLE, autoSpeakReplies: enabled ? true : this.state.autoSpeakReplies });

    if (enabled) {
      if (this.restartTimeoutRef) clearTimeout(this.restartTimeoutRef);
      if (this.state.voiceInputMode !== 'recorded' && !isAndroidDevice()) this.watchdogRef?.start();
      this._cancelTTS();
      window.setTimeout(() => this._safeStartRecognition(), 150);
    } else {
      this.watchdogRef?.stop();
      this._stopRecognition(false);
      if (this.restartTimeoutRef) clearTimeout(this.restartTimeoutRef);
      this._cancelTTS();
      this._updateState({ machineState: VOICE_PHASE.IDLE, isListening: false, isSpeaking: false });
    }
  }

  toggleHandsFree() {
    this.setHandsFree(!this.state.handsFree);
  }

  toggleAutoSpeakReplies() {
    const next = !this.state.autoSpeakReplies;
    safeStorage.setItem('autoSpeakReplies', next ? 'true' : 'false');
    this._updateState({ autoSpeakReplies: next });
    if (next) this._warmupTTS();
    return next;
  }

  resumeListening() {
    if (this.state.voiceInputMode === 'recorded' && this.state.handsFree && !this.state.isSpeaking) {
      this.recordedVoiceRef?.resumeCapture();
    }
  }

  setRecognitionLanguage(lang) {
    if (!lang || lang === this.state.recognitionLang) return;
    this._updateState({ recognitionLang: lang });
    if (this.recognitionRef) {
      const shouldRestart = this.state.handsFree || this.state.isRecognitionActive || this.state.isRecognitionStarting;
      this._stopRecognition();
      this.recognitionRef = this._buildRecognition();
      if (shouldRestart && this._canRestartRecognition()) {
        this._safeStartRecognition();
      }
    }
  }

  _cancelTTS() {
    if (this.ttsTimeoutRef) clearTimeout(this.ttsTimeoutRef);
    this.ttsTimeoutRef = null;
    this.ttsInFlightRef = false;
    try {
      window.speechSynthesis?.cancel();
      this.recordedVoiceRef?.cancelTTS?.();
    } catch {}
    this.ttsUtteranceRef = null;
    this.restartAllowedRef = this.state.handsFree;
    this._updateState({ isSpeaking: false, machineState: VOICE_PHASE.IDLE });
  }

  _splitSpeechText(text) {
    return text
      .replace(/\s+/g, ' ')
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.reduce((chunks, sentence) => {
        const clean = sentence.trim();
        if (!clean) return chunks;
        const last = chunks[chunks.length - 1] || '';
        if ((last + ' ' + clean).length <= 260) {
          chunks[chunks.length - 1] = last ? `${last} ${clean}` : clean;
        } else {
          chunks.push(clean);
        }
        return chunks;
      }, [])
      .slice(0, 8) || [];
  }

  speakInstantAck(lang = 'hu') {
    const started = performance.now();
    const played = playLocalAckTone();
    console.info('[voiceTiming] Instant ack', { ms: Math.round(performance.now() - started), played, lang });
    if (played) return Promise.resolve(true);
    if (this.state.voiceInputMode === 'recorded') {
      return this.recordedVoiceRef?.speakInstantAck(lang) || Promise.resolve(false);
    }
    return Promise.resolve(false);
  }

  speakText(text, lang = 'hu') {
    if (this.ttsInFlightRef) {
      logger.warn(MODULE, 'TTS_BLOCKED_OVERLAP', { phase: this.state.phase });
      return Promise.resolve(false);
    }
    const selectedLang = lang === 'hu' || lang === 'hu-HU' ? 'hu' : lang;
    console.info('[voiceLanguage] Selected output language', { selectedLang });
    if (this.state.voiceInputMode === 'recorded') {
      this.ttsInFlightRef = true;
      this.restartAllowedRef = false;
      this.recordedVoiceRef?.stopContinuous?.();
      this._updateState({ machineState: VOICE_PHASE.SPEAKING, isSpeaking: true, isListening: false, isRecognitionActive: false, isRecognitionStarting: false });
      devVoiceLog('TTS_START', { mode: 'recorded' });
      const ttsStarted = performance.now();
      return (this.recordedVoiceRef?.speakText(text, selectedLang, { resumeAfter: this.state.handsFree }) || Promise.resolve(false)).then((success) => {
        devVoiceLog(success ? 'TTS_END' : 'TTS_ERROR', { mode: 'recorded' });
        return success;
      }).finally(() => {
        this.ttsInFlightRef = false;
        this.restartAllowedRef = this.state.handsFree;
        this._updateState({ machineState: VOICE_PHASE.IDLE, isSpeaking: false });
        console.info('[voiceTiming] TTS finished', { ms: Math.round(performance.now() - ttsStarted), resumeAfter: this.state.handsFree });
      });
    }
    if (!canUseBrowserTTS() || text == null) return Promise.resolve(false);
    const safeText = typeof text === 'string' ? text.trim() : '';
    if (!safeText) return Promise.resolve(false);

    this.ttsInFlightRef = true;
    this.restartAllowedRef = false;
    this._stopRecognition(true);
    this.recognitionStateRef = { isActive: false, isStarting: false };
    this._updateState({ machineState: VOICE_PHASE.SPEAKING, isSpeaking: false, isListening: false, isRecognitionActive: false, isRecognitionStarting: false });

    return new Promise((resolve) => {
      const langMap = { hu: 'hu-HU', en: 'en-US', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', ro: 'ro-RO', pl: 'pl-PL', pt: 'pt-PT', ru: 'ru-RU', ar: 'ar-SA', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR' };
      const chunks = this._splitSpeechText(safeText).length ? this._splitSpeechText(safeText) : [safeText.slice(0, 260)];
      let finalized = false;
      let index = 0;

      const finish = (success) => {
        if (finalized) return;
        finalized = true;
        if (this.ttsTimeoutRef) clearTimeout(this.ttsTimeoutRef);
        this.ttsUtteranceRef = null;
        this.ttsInFlightRef = false;
        this.restartAllowedRef = this.state.handsFree;
        this._updateState({ machineState: VOICE_PHASE.IDLE, isSpeaking: false });
        logger.debug(MODULE, success ? 'TTS_END' : 'TTS_ERROR', { success, chunks: index });
        devVoiceLog(success ? 'TTS_END' : 'TTS_ERROR', { success, chunks: index });
        if (this.state.handsFree && this._canRestartRecognition()) {
          this._scheduleRestart(HANDS_FREE_RESTART_DELAY_MS, 'tts_onend');
        }
        resolve(success);
      };

      const speakChunk = () => {
        if (finalized) return;
        const chunk = chunks[index];
        if (!chunk) {
          finish(true);
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = langMap[selectedLang] || this.languageLockRef || this.state.recognitionLang || 'hu-HU';
        const voices = window.speechSynthesis.getVoices?.() || [];
        const huVoice = voices.find(v => /^hu[-_]/i.test(v.lang || ''));
        if (selectedLang === 'hu' && huVoice) utterance.voice = huVoice;
        utterance.rate = 1.03;
        utterance.pitch = 1;
        utterance.volume = 1;
        utterance.onstart = () => {
          logger.debug(MODULE, 'TTS_START', { chunk: index + 1, total: chunks.length });
          devVoiceLog('TTS_START', { chunk: index + 1, total: chunks.length });
          this._updateState({ machineState: VOICE_PHASE.SPEAKING, isSpeaking: true, isListening: false, isRecognitionActive: false, isRecognitionStarting: false });
        };
        utterance.onend = () => {
          index += 1;
          window.setTimeout(speakChunk, 120);
        };
        utterance.onerror = () => finish(false);

        this.ttsUtteranceRef = utterance;
        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          finish(false);
        }
      };

      window.speechSynthesis.cancel();
      if (this.voicesLoadedRef) {
        speakChunk();
      } else {
        window.setTimeout(() => {
          this.voicesLoadedRef = (window.speechSynthesis.getVoices?.() || []).length > 0;
          speakChunk();
        }, 250);
      }

      this.ttsTimeoutRef = window.setTimeout(() => {
        if (this.state.machineState === VOICE_PHASE.SPEAKING || this.state.phase === 'speaking' || this.state.phase === 'tts_pending') {
          window.speechSynthesis.cancel();
          finish(false);
        }
      }, 20000);
    });
  }

  getState() {
    return { ...this.state };
  }

  destroy() {
    this.watchdogRef?.stop();
    this._stopRecognition();
    if (this.restartTimeoutRef) clearTimeout(this.restartTimeoutRef);
    if (this.ttsTimeoutRef) clearTimeout(this.ttsTimeoutRef);
    this._cancelTTS();
    this.transcriptQueue.clear();
    logger.info(MODULE, 'Voice runtime destroyed');
  }
}

// ─── SINGLETON EXPORT ──────────────────────────────────────────────────────────
let instance = null;

export function getVoiceRuntime() {
  if (!instance) {
    instance = new VoiceRuntime();
  }
  return instance;
}

export function destroyVoiceRuntime() {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}