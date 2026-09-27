import { jarvis } from '@/api/jarvisClient';
import { startLipSyncFromAudioElement, stopLipSync } from '@/lib/lipSyncBus';
import { speak as speakBrowserTTS } from '@/lib/voiceTTS';

const SEGMENT_MS = 1800;
const RECORDER_TIMESLICE_MS = 120;
const AUDIO_BITS_PER_SECOND = 20000;
const RESUME_AFTER_TRANSCRIPT_MS = 20000;
const TTS_CACHE_LIMIT = 24;
const INSTANT_ACKS = ['Értem.', 'Rendben.', 'Oké.'];
const FAST_BROWSER_TTS_MAX_LENGTH = 420;
const STT_HALLUCINATION_PATTERNS = [
  /feliratok az amara\.org/i,
  /amara\.org közösségétől/i,
  /jó étvágyat kíván/i,
  /^nézd meg[!.]?$/i,
  /^ecosdarae[.!]?$/i,
  /^[a-z]{4,12}[.!]?$/i,
];
let localAckAudioContext = null;

export function playLocalAckTone() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    localAckAudioContext = localAckAudioContext || new AudioContextClass();
    const ctx = localAckAudioContext;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.13);
    return true;
  } catch {
    return false;
  }
}

const ttsCache = new Map();
let warmupPromise = null;

export function canUseRecordedVoiceIO() {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof window !== 'undefined'
    && 'MediaRecorder' in window
    && window.jarvisDesktop?.capabilities?.recordedStt === true;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || '').split(',').pop() || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

function isLikelySilenceTranscript(text = '') {
  const clean = String(text || '').trim();
  if (!clean) return true;
  return STT_HALLUCINATION_PATTERNS.some((pattern) => pattern.test(clean));
}

function getBrowserSpeechLang(lang = 'hu') {
  if (lang === 'en') return 'en-GB';
  if (lang === 'de') return 'de-DE';
  if (lang === 'fr') return 'fr-FR';
  if (lang === 'es') return 'es-ES';
  return 'hu-HU';
}

function shortenForFastSpeech(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').replace(/[*_#`]/g, '').trim();
  if (clean.length <= FAST_BROWSER_TTS_MAX_LENGTH) return clean;
  return `${clean.slice(0, FAST_BROWSER_TTS_MAX_LENGTH).replace(/\s+\S*$/, '')}.`;
}

function splitForSpeech(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.reduce((chunks, sentence) => {
      const clean = sentence.trim();
      if (!clean) return chunks;
      const last = chunks[chunks.length - 1] || '';
      if (last && `${last} ${clean}`.length <= 180) chunks[chunks.length - 1] = `${last} ${clean}`;
      else chunks.push(clean);
      return chunks;
    }, [])
    .slice(0, 10) || [];
}

export function createRecordedVoiceIO({ onTranscript, onError, onStateChange }) {
  let active = false;
  let stream = null;
  let recorder = null;
  let chunks = [];
  let segmentTimer = null;
  let resumeTimer = null;
  let processing = false;
  let paused = false;
  let discardCurrent = false;
  let audio = null;

  const emitError = (type, message) => onError?.({ type, message });

  const warmupVoiceEndpoints = () => {
    if (warmupPromise || !navigator.onLine) return warmupPromise;
    const warmAck = (text) => jarvis.functions.invoke('synthesizeVoice', { text, lang: 'hu' })
      .then((response) => {
        const audioBase64 = response.data?.audioBase64;
        const mimeType = response.data?.mimeType || 'audio/mpeg';
        if (audioBase64) ttsCache.set(`hu:${text.toLowerCase()}`, { audioBase64, mimeType });
      });
    warmupPromise = Promise.allSettled([
      jarvis.functions.invoke('transcribeVoice', { warmup: true }),
      ...INSTANT_ACKS.map(warmAck),
    ]).catch(() => null);
    return warmupPromise;
  };

  const clearTimers = () => {
    if (segmentTimer) window.clearTimeout(segmentTimer);
    if (resumeTimer) window.clearTimeout(resumeTimer);
    segmentTimer = null;
    resumeTimer = null;
  };

  const ensureStream = async () => {
    if (stream?.active) return stream;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    return stream;
  };

  const stopRecorder = (discard = false) => {
    discardCurrent = discard;
    if (recorder?.state === 'recording') {
      try { recorder.stop(); } catch {}
    }
  };

  const scheduleResumeFallback = () => {
    if (resumeTimer) window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(() => {
      paused = false;
      if (active && !processing) startSegment();
    }, RESUME_AFTER_TRANSCRIPT_MS);
  };

  const transcribeBlob = async (blob) => {
    if (!navigator.onLine) {
      emitError('network_offline', 'Nincs internetkapcsolat, a hangfelismerés szünetel.');
      return '';
    }

    const started = performance.now();
    onStateChange?.({ phase: 'processing', isListening: false, isRecognitionActive: false });
    const audioBase64 = await blobToBase64(blob);
    const response = await jarvis.functions.invoke('transcribeVoice', {
      audioBase64,
      mimeType: blob.type || 'audio/webm',
    });
    console.info('[voiceTiming] STT finished', { ms: Math.round(performance.now() - started), lang: 'hu-HU' });
    return String(response.data?.text || '').trim();
  };

  const startSegment = async () => {
    if (!active || paused || processing || recorder?.state === 'recording') return;

    try {
      const currentStream = await ensureStream();
      chunks = [];
      discardCurrent = false;
      const mimeType = MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      recorder = new MediaRecorder(currentStream, { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND });

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };

      recorder.onerror = () => emitError('recording_failed', 'A hangrögzítés megszakadt.');

      recorder.onstop = async () => {
        const shouldDiscard = discardCurrent;
        const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
        recorder = null;
        chunks = [];
        discardCurrent = false;

        if (!active || shouldDiscard || blob.size < 700) {
          if (active && !paused) window.setTimeout(startSegment, 120);
          return;
        }

        processing = true;
        onStateChange?.({ phase: 'processing', isListening: false, isRecognitionActive: false });

        try {
          const text = await transcribeBlob(blob);
          if (text && !isLikelySilenceTranscript(text)) {
            paused = true;
            console.info('[voiceLanguage] STT detected input language', { lang: 'hu-HU', text });
            onTranscript?.(text);
            scheduleResumeFallback();
          }
        } catch {
          if (!navigator.onLine) {
            emitError('network_offline', 'Nincs internetkapcsolat, a hangfelismerés szünetel.');
          }
        } finally {
          processing = false;
          if (active && !paused) window.setTimeout(startSegment, 120);
        }
      };

      recorder.start(RECORDER_TIMESLICE_MS);
      onStateChange?.({ phase: 'listening', isListening: true, isRecognitionActive: true, isRecognitionStarting: false });
      segmentTimer = window.setTimeout(() => stopRecorder(false), SEGMENT_MS);
    } catch {
      emitError('microphone_denied', 'A mikrofon nem érhető el vagy nincs engedélyezve.');
      active = false;
      onStateChange?.({ phase: 'idle', isListening: false, isRecognitionActive: false, isRecognitionStarting: false });
    }
  };

  const resumeCapture = () => {
    if (!active) return;
    if (resumeTimer) window.clearTimeout(resumeTimer);
    paused = false;
    onStateChange?.({ phase: 'listening', isListening: true, isRecognitionActive: true, isRecognitionStarting: false });
    window.setTimeout(startSegment, 180);
  };

  return {
    async startContinuous() {
      if (!canUseRecordedVoiceIO()) return false;
      if (active) return true;
      if (!navigator.onLine) {
        emitError('network_offline', 'Nincs internetkapcsolat, a hangvezérlés most nem indítható.');
        return false;
      }
      active = true;
      paused = false;
      await ensureStream();
      warmupVoiceEndpoints();
      window.setTimeout(startSegment, 250);
      return true;
    },

    pauseCapture() {
      paused = true;
      stopRecorder(true);
      onStateChange?.({ phase: 'processing', isListening: false, isRecognitionActive: false, isRecognitionStarting: false });
    },

    resumeCapture,

    stopContinuous() {
      active = false;
      paused = false;
      processing = false;
      clearTimers();
      stopRecorder(true);
      stopStream(stream);
      stream = null;
      onStateChange?.({ phase: 'idle', isListening: false, isRecognitionActive: false, isRecognitionStarting: false });
    },

    async speakInstantAck(lang = 'hu') {
      if (playLocalAckTone()) return true;
      const ack = INSTANT_ACKS[Math.floor(Math.random() * INSTANT_ACKS.length)];
      return this.speakText(ack, lang, { resumeAfter: false });
    },

    async speakText(text, lang = 'hu', options = {}) {
      const safeText = typeof text === 'string' ? text.trim() : '';
      if (!safeText) return false;

      this.pauseCapture();
      onStateChange?.({ phase: 'tts_pending', isSpeaking: false, isListening: false });

      try {
        const fastSpeechText = shortenForFastSpeech(safeText);
        if (fastSpeechText.length <= FAST_BROWSER_TTS_MAX_LENGTH) {
          onStateChange?.({ phase: 'speaking', isSpeaking: true, isListening: false });
          await new Promise((resolve) => speakBrowserTTS(fastSpeechText, getBrowserSpeechLang(lang), resolve));
          return true;
        }

        if (!navigator.onLine) {
          emitError('network_offline', 'Nincs internetkapcsolat, a hangválasz nem játszható le.');
          return false;
        }

        audio?.pause?.();
        const started = performance.now();
        const chunksToSpeak = splitForSpeech(safeText);
        if (chunksToSpeak.length === 0) return false;

        const fetchChunk = async (chunk) => {
          const cacheKey = `${lang}:${chunk.toLowerCase()}`;
          const cached = ttsCache.get(cacheKey);
          if (cached) return cached;
          const response = await jarvis.functions.invoke('synthesizeVoice', { text: chunk, lang });
          const audioBase64 = response.data?.audioBase64;
          const mimeType = response.data?.mimeType || 'audio/mpeg';
          if (!audioBase64) return null;
          const next = { audioBase64, mimeType };
          ttsCache.set(cacheKey, next);
          if (ttsCache.size > TTS_CACHE_LIMIT) ttsCache.delete(ttsCache.keys().next().value);
          return next;
        };

        let nextAudioPromise = fetchChunk(chunksToSpeak[0]);
        for (let i = 0; i < chunksToSpeak.length; i += 1) {
          const cached = await nextAudioPromise;
          if (!cached) continue;
          nextAudioPromise = chunksToSpeak[i + 1] ? fetchChunk(chunksToSpeak[i + 1]) : Promise.resolve(null);

          audio = new Audio(`data:${cached.mimeType};base64,${cached.audioBase64}`);
          audio.preload = 'auto';
          audio.volume = 1;
          onStateChange?.({ phase: 'speaking', isSpeaking: true, isListening: false });
          startLipSyncFromAudioElement(audio);
          await audio.play();
          if (i === 0) console.info('[voiceTiming] TTS first audio', { ms: Math.round(performance.now() - started), mode: 'chunked-prefetch' });
          await new Promise((resolve) => {
            audio.onended = resolve;
            audio.onerror = resolve;
          });
        }
        return true;
      } catch {
        emitError('tts_failed', 'A hangválasz lejátszása most nem sikerült.');
        return false;
      } finally {
        stopLipSync();
        onStateChange?.({ phase: 'idle', isSpeaking: false });
        if (options.resumeAfter !== false) resumeCapture();
      }
    },
  };
}