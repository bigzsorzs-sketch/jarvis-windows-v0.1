export async function requestMicrophonePermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, message: 'Ez az eszköz nem támogatja a mikrofon hozzáférést a böngészőben.' };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { ok: true };
  } catch {
    return { ok: false, message: 'A mikrofon engedélyezése szükséges a Live Assistant használatához.' };
  }
}