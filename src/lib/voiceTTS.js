import { sanitizeForSpeech, getVoicePreferences, chooseVoice } from '@/lib/speechPresentation';

/** Lightweight TTS wrapper with presentation-only cleanup. */
export function speak(text, lang = 'hu-HU', onEnd = null) {
  if (!('speechSynthesis' in window)) { onEnd?.(); return; }
  const clean = sanitizeForSpeech(text);
  if (!clean) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(clean);
  const prefs = getVoicePreferences();
  utt.lang = lang;
  utt.voice = chooseVoice(window.speechSynthesis.getVoices?.() || [], lang, prefs.name);
  utt.rate = prefs.rate;
  utt.pitch = prefs.pitch;
  utt.volume = 1;
  if (onEnd) utt.onend = onEnd;
  window.speechSynthesis.speak(utt);
}
export function cancelSpeech() { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }
