import { jarvis } from '@/api/jarvisClient';
import { startLipSyncFromAudioElement, stopLipSync } from '@/lib/lipSyncBus';
import { computeSpeechThreshold, hasLiveAudioTrack, isLikelySilenceTranscript, microphoneErrorMessage, updateNoiseFloor } from '@/lib/voiceInputHealth';

const RECORDER_TIMESLICE_MS = 120;
const AUDIO_BITS_PER_SECOND = 32000;
const VAD_POLL_MS = 80;
const END_OF_SPEECH_SILENCE_MS = 900;
const NO_SPEECH_TIMEOUT_MS = 6000;
const MAX_UTTERANCE_MS = 15000;
const RESUME_AFTER_TRANSCRIPT_MS = 30000;
const TTS_CACHE_LIMIT = 24;
const TTS_SEGMENT_MAX_CHARS = 1400;
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
    gain.gain.exponentialRampToValueAtTime(0.13, ctx.currentTime + 0.015);
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

function splitForSpeech(text) {
  const sentences = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];

  const chunks = [];
  for (const sentence of sentences) {
    const clean = sentence.trim();
    if (!clean) continue;
    const last = chunks[chunks.length - 1] || '';
    if (last && `${last} ${clean}`.length <= TTS_SEGMENT_MAX_CHARS) {
      chunks[chunks.length - 1] = `${last} ${clean}`;
    } else {
      chunks.push(clean);
    }
  }
  return chunks;
}

export function createRecordedVoiceIO({ onTranscript, onError, onStateChange }) {
  let active = false;
  let captureGeneration = 0;
  let stream = null;
  let recorder = null;
  let chunks = [];
  let vadTimer = null;
  let resumeTimer = null;
  let processing = false;
  let paused = false;
  let discardCurrent = false;
  let audio = null;
  let audioContext = null;
  let analyser = null;
  let mediaSource = null;
  let vadSamples = null;
  let segmentStartedAt = 0;
  let speechDetected = false;
  let lastSpeechAt = 0;
  let noiseFloor = 0.006;

  const emitError = (type, message) => onError?.({ type, message });

  const clearVad = () => {
    if (vadTimer) window.clearInterval(vadTimer);
    vadTimer = null;
  };

  const clearTimers = () => {
    clearVad();
    if (resumeTimer) window.clearTimeout(resumeTimer);
    resumeTimer = null;
  };

  const closeAudioInputGraph = async () => {
    try { mediaSource?.disconnect?.(); } catch {}
    mediaSource = null;
    analyser = null;
    vadSamples = null;
    if (audioContext && audioContext !== localAckAudioContext) {
      try { await audioContext.close(); } catch {}
    }
    audioContext = null;
  };

  const ensureStream = async () => {
    if (hasLiveAudioTrack(stream)) return stream;

    if (stream) {
      stopStream(stream);
      stream = null;
      await closeAudioInputGraph();
    }

    const nextStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    stream = nextStream;

    for (const track of nextStream.getAudioTracks?.() || []) {
      track.addEventListener?.('ended', () => {
        if (stream !== nextStream) return;
        stream = null;
        void closeAudioInputGraph();
        if (active && !paused && !processing) {
          window.setTimeout(startSegment, 600);
        }
      }, { once:true });
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
      try { await audioContext.resume(); } catch {}
      mediaSource = audioContext.createMediaStreamSource(nextStream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.25;
      vadSamples = new Uint8Array(analyser.fftSize);
      mediaSource.connect(analyser);
    }

    return nextStream;
  };

  const currentRms = () => {
    if (!analyser || !vadSamples) return 0;
    analyser.getByteTimeDomainData(vadSamples);
    let sum = 0;
    for (let i = 0; i < vadSamples.length; i += 1) {
      const normalized = (vadSamples[i] - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / vadSamples.length);
  };

  const stopRecorder = (discard = false) => {
    discardCurrent = discardCurrent || discard;
    clearVad();
    if (recorder?.state === 'recording') {
      try { recorder.stop(); } catch {}
    }
  };

  const startVad = () => {
    clearVad();
    segmentStartedAt = performance.now();
    speechDetected = false;
    lastSpeechAt = 0;
    noiseFloor = 0.006;

    vadTimer = window.setInterval(() => {
      if (!recorder || recorder.state !== 'recording') return;

      const now = performance.now();
      const elapsed = now - segmentStartedAt;
      const rms = currentRms();
      const speechThreshold = computeSpeechThreshold(noiseFloor);

      if (rms >= speechThreshold) {
        speechDetected = true;
        lastSpeechAt = now;
      } else if (!speechDetected) {
        // Learn only from samples below the speech threshold so quiet speech
        // does not get absorbed into the ambient-noise estimate.
        noiseFloor = updateNoiseFloor(noiseFloor, rms);
      }

      if (speechDetected && lastSpeechAt && now - lastSpeechAt >= END_OF_SPEECH_SILENCE_MS) {
        stopRecorder(false);
        return;
      }

      if (!speechDetected && elapsed >= NO_SPEECH_TIMEOUT_MS) {
        stopRecorder(true);
        return;
      }

      if (elapsed >= MAX_UTTERANCE_MS) {
        stopRecorder(!speechDetected);
      }
    }, VAD_POLL_MS);
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
    console.info('[voiceTiming] Model STT finished', {
      ms: Math.round(performance.now() - started),
      model: response.data?.model || null,
    });
    return String(response.data?.text || '').trim();
  };

  const startSegment = async () => {
    if (!active || paused || processing || recorder?.state === 'recording') return;

    try {
      const currentStream = await ensureStream();
      const segmentGeneration = captureGeneration;
      chunks = [];
      discardCurrent = false;
      const mimeType = MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      recorder = new MediaRecorder(currentStream, {
        mimeType,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };

      recorder.onerror = () => {
        emitError('recording_failed', 'A hangrögzítés megszakadt.');
        active = false;
        paused = false;
        processing = false;
        captureGeneration += 1;
        clearTimers();
        stopRecorder(true);
        stopStream(stream);
        stream = null;
        void closeAudioInputGraph();
        onStateChange?.({ phase:'error', isListening:false, isRecognitionActive:false, isRecognitionStarting:false });
      };

      recorder.onstop = async () => {
        clearVad();
        const shouldDiscard = discardCurrent || !speechDetected;
        const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
        recorder = null;
        chunks = [];
        discardCurrent = false;

        if (!active || shouldDiscard || blob.size < 700) {
          if (active && !paused) window.setTimeout(startSegment, 140);
          return;
        }

        processing = true;
        onStateChange?.({ phase: 'processing', isListening: false, isRecognitionActive: false });

        try {
          const text = await transcribeBlob(blob);
          if (!active || segmentGeneration !== captureGeneration) return;
          if (text && !isLikelySilenceTranscript(text)) {
            paused = true;
            console.info('[voiceLanguage] Model STT transcript received', { text });
            onTranscript?.(text);
            scheduleResumeFallback();
          }
        } catch (error) {
          const message = error?.message || '';
          if (!navigator.onLine) {
            emitError('network_offline', 'Nincs internetkapcsolat, a hangfelismerés szünetel.');
          } else {
            emitError('stt_failed', `A modell alapú hangfelismerés nem sikerült. ${message}`.trim());
          }
        } finally {
          processing = false;
          if (active && !paused) window.setTimeout(startSegment, 140);
        }
      };

      recorder.start(RECORDER_TIMESLICE_MS);
      startVad();
      onStateChange?.({ phase: 'listening', isListening: true, isRecognitionActive: true, isRecognitionStarting: false });
    } catch (error) {
      emitError('microphone_denied', microphoneErrorMessage(error));
      captureGeneration += 1;
      active = false;
      paused = false;
      processing = false;
      stopStream(stream);
      stream = null;
      await closeAudioInputGraph();
      onStateChange?.({ phase: 'error', isListening: false, isRecognitionActive: false, isRecognitionStarting: false });
    }
  };

  const resumeCapture = () => {
    if (!active) return;
    if (resumeTimer) window.clearTimeout(resumeTimer);
    resumeTimer = null;
    paused = false;
    onStateChange?.({ phase: 'listening', isListening: true, isRecognitionActive: true, isRecognitionStarting: false });
    window.setTimeout(startSegment, 180);
  };

  const cancelTTS = () => {
    try {
      audio?.pause?.();
      if (audio) audio.currentTime = 0;
    } catch {}
    audio = null;
    stopLipSync();
  };

  return {
    async startContinuous() {
      if (!canUseRecordedVoiceIO()) return false;
      if (!navigator.onLine) {
        emitError('network_offline', 'Nincs internetkapcsolat, a hangvezérlés most nem indítható.');
        return false;
      }

      if (active && hasLiveAudioTrack(stream)) {
        if (paused && !processing) resumeCapture();
        return true;
      }

      if (active) {
        active = false;
        paused = false;
        processing = false;
        clearTimers();
        stopRecorder(true);
        stopStream(stream);
        stream = null;
        await closeAudioInputGraph();
      }

      captureGeneration += 1;
      active = true;
      paused = false;
      try {
        await ensureStream();
        if (!hasLiveAudioTrack(stream)) throw new Error('MICROPHONE_STREAM_NOT_LIVE');
        window.setTimeout(startSegment, 180);
        return true;
      } catch (error) {
        active = false;
        paused = false;
        processing = false;
        clearTimers();
        stopRecorder(true);
        stopStream(stream);
        stream = null;
        await closeAudioInputGraph();
        emitError('microphone_denied', microphoneErrorMessage(error));
        onStateChange?.({ phase: 'error', isListening: false, isRecognitionActive: false, isRecognitionStarting: false });
        return false;
      }
    },

    pauseCapture() {
      paused = true;
      stopRecorder(true);
      onStateChange?.({ phase: 'processing', isListening: false, isRecognitionActive: false, isRecognitionStarting: false });
    },

    resumeCapture,

    stopContinuous() {
      captureGeneration += 1;
      active = false;
      paused = false;
      processing = false;
      clearTimers();
      stopRecorder(true);
      stopStream(stream);
      stream = null;
      closeAudioInputGraph();
      onStateChange?.({ phase: 'idle', isListening: false, isRecognitionActive: false, isRecognitionStarting: false });
    },

    cancelTTS,

    async speakInstantAck() {
      return playLocalAckTone();
    },

    async speakText(text, lang = 'hu', options = {}) {
      const safeText = typeof text === 'string' ? text.trim() : '';
      if (!safeText) return false;

      this.pauseCapture();
      cancelTTS();
      onStateChange?.({ phase: 'tts_pending', isSpeaking: false, isListening: false });

      try {
        if (!navigator.onLine) {
          emitError('network_offline', 'Nincs internetkapcsolat, a modellhang most nem játszható le.');
          return false;
        }

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
          if (!audioBase64) throw new Error(response.data?.reason || 'MODEL_TTS_EMPTY_AUDIO');

          const next = {
            audioBase64,
            mimeType,
            model: response.data?.model || null,
            voice: response.data?.voice || null,
          };
          ttsCache.set(cacheKey, next);
          if (ttsCache.size > TTS_CACHE_LIMIT) ttsCache.delete(ttsCache.keys().next().value);
          return next;
        };

        let nextAudioPromise = fetchChunk(chunksToSpeak[0]);
        for (let i = 0; i < chunksToSpeak.length; i += 1) {
          const cached = await nextAudioPromise;
          nextAudioPromise = chunksToSpeak[i + 1]
            ? fetchChunk(chunksToSpeak[i + 1])
            : Promise.resolve(null);

          audio = new Audio(`data:${cached.mimeType};base64,${cached.audioBase64}`);
          audio.preload = 'auto';
          audio.volume = 1;
          onStateChange?.({ phase: 'speaking', isSpeaking: true, isListening: false });
          startLipSyncFromAudioElement(audio);

          await new Promise((resolve, reject) => {
            audio.onended = resolve;
            audio.onerror = () => reject(new Error('MODEL_TTS_PLAYBACK_FAILED'));
            audio.play().catch(reject);
          });

          if (i === 0) {
            console.info('[voiceTiming] Model TTS first audio', {
              ms: Math.round(performance.now() - started),
              model: cached.model,
              voice: cached.voice,
            });
          }
        }
        return true;
      } catch (error) {
        emitError('tts_failed', `A modellhang lejátszása most nem sikerült. ${error?.message || ''}`.trim());
        return false;
      } finally {
        cancelTTS();
        onStateChange?.({ phase: 'idle', isSpeaking: false });
        if (options.resumeAfter !== false) resumeCapture();
      }
    },
  };
}
