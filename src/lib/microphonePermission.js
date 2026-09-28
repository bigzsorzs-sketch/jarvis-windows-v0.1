import { microphoneErrorMessage } from '@/lib/voiceInputHealth';

const MIC_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

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
