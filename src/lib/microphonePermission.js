const MIC_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

function microphoneErrorMessage(error) {
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

export async function requestMicrophonePermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, message: 'Ez az eszköz nem támogatja a mikrofon hozzáférést.' };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
    const track = stream.getAudioTracks?.()[0];
    const settings = track?.getSettings?.() || {};
    stream.getTracks().forEach((item) => item.stop());
    return {
      ok: true,
      deviceId: settings.deviceId || null,
      sampleRate: settings.sampleRate || null,
      channelCount: settings.channelCount || null,
    };
  } catch (error) {
    return { ok: false, code: error?.name || 'MICROPHONE_ERROR', message: microphoneErrorMessage(error) };
  }
}
