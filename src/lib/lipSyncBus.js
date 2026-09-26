const subscribers = new Set();
let level = 0;
let active = false;
let audioContext = null;
let analyser = null;
let source = null;
let frame = null;
let buffer = null;
let smoothed = 0;
let connectedAudio = null;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function emit(nextLevel, nextActive = active) {
  level = clamp01(nextLevel);
  active = Boolean(nextActive);
  subscribers.forEach((callback) => callback({ level, active }));
}

function stopLoop() {
  if (frame) cancelAnimationFrame(frame);
  frame = null;
}

function analyse() {
  if (!analyser || !buffer) return;
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const centered = (buffer[i] - 128) / 128;
    sum += centered * centered;
  }
  const rms = Math.sqrt(sum / buffer.length);
  const target = clamp01((rms - 0.015) * 8.5);
  smoothed = smoothed + (target - smoothed) * 0.2;
  emit(smoothed, true);
  frame = requestAnimationFrame(analyse);
}

export function subscribeLipSync(callback) {
  subscribers.add(callback);
  callback({ level, active });
  return () => subscribers.delete(callback);
}

export function startLipSyncFromAudioElement(audioElement) {
  if (typeof window === 'undefined' || !audioElement) return false;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;

  try {
    audioContext = audioContext || new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume?.();

    if (connectedAudio !== audioElement) {
      source?.disconnect?.();
      analyser?.disconnect?.();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      buffer = new Uint8Array(analyser.fftSize);
      source = audioContext.createMediaElementSource(audioElement);
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      connectedAudio = audioElement;
      console.info('[LipSync] Audio analyser connected');
    }

    stopLoop();
    smoothed = 0;
    emit(0, true);
    frame = requestAnimationFrame(analyse);
    return true;
  } catch (error) {
    console.warn('[LipSync] Audio analyser unavailable', error?.message || error);
    emit(0, false);
    return false;
  }
}

export function stopLipSync() {
  stopLoop();
  const settle = () => {
    smoothed = smoothed + (0 - smoothed) * 0.2;
    emit(smoothed, smoothed > 0.01);
    if (smoothed > 0.01) frame = requestAnimationFrame(settle);
    else emit(0, false);
  };
  frame = requestAnimationFrame(settle);
}

export function getLipSyncSnapshot() {
  return { level, active };
}