const STT_HALLUCINATION_PATTERNS = [
  /feliratok az amara\.org/i,
  /amara\.org közösségétől/i,
  /^ecosdarae[.!]?$/i,
];

export function isLikelySilenceTranscript(text = '') {
  const clean = String(text || '').trim();
  if (!clean) return true;
  return STT_HALLUCINATION_PATTERNS.some((pattern) => pattern.test(clean));
}

export function computeSpeechThreshold(noiseFloor = 0.006) {
  const floor = Number.isFinite(Number(noiseFloor)) ? Math.max(0, Number(noiseFloor)) : 0.006;
  return Math.max(0.008, Math.min(0.04, (floor * 1.5) + 0.002));
}

export function updateNoiseFloor(noiseFloor = 0.006, rms = 0) {
  const current = Number.isFinite(Number(noiseFloor)) ? Math.max(0, Number(noiseFloor)) : 0.006;
  const sample = Number.isFinite(Number(rms)) ? Math.max(0, Number(rms)) : 0;
  if (sample <= 0 || sample >= computeSpeechThreshold(current)) return current;
  return (current * 0.95) + (Math.min(sample, 0.025) * 0.05);
}

export function hasLiveAudioTrack(stream) {
  if (!stream?.active || typeof stream.getAudioTracks !== 'function') return false;
  return stream.getAudioTracks().some((track) => track?.readyState === 'live' && track?.enabled !== false);
}

export function microphoneErrorMessage(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'A mikrofon hozzáférése le van tiltva. Engedélyezd a Jarvis számára a Windows / alkalmazás mikrofon-hozzáférését.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Nem találok használható mikrofont ezen a gépen.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'A mikrofont egy másik alkalmazás használja, vagy a Windows nem tudja megnyitni.';
  }
  return 'A mikrofon nem indítható. Ellenőrizd a Windows mikrofonengedélyét és a kiválasztott bemeneti eszközt.';
}
