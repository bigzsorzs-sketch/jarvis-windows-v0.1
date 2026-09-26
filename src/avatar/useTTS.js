import { useCallback, useRef, useState } from 'react';
import { stopLipSync } from '@/lib/lipSyncBus';

const LANG_MAP = {
  hu: 'hu-HU',
  'hu-HU': 'hu-HU',
  en: 'en-US',
  'en-US': 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
};

function splitSpeech(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.reduce((chunks, sentence) => {
      const clean = sentence.trim();
      const last = chunks[chunks.length - 1] || '';
      if (!clean) return chunks;
      if ((last + ' ' + clean).length <= 220) chunks[chunks.length - 1] = last ? `${last} ${clean}` : clean;
      else chunks.push(clean);
      return chunks;
    }, []) || [];
}

export function useTTS({ lang = 'hu', onStart, onEnd, onMouth, onBoundary } = {}) {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const utteranceRef = useRef(null);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    try { window.speechSynthesis?.cancel(); } catch {}
    stopLipSync();
    utteranceRef.current = null;
    setSpeaking(false);
    onMouth?.(0);
    onEnd?.();
  }, [onEnd, onMouth]);

  const speak = useCallback((text, options = {}) => {
    const safeText = String(text || '').trim();
    if (!safeText) return Promise.resolve({ ok: false, reason: 'empty' });
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setError('A hangos válasz nem támogatott ezen az eszközön.');
      return Promise.resolve({ ok: false, reason: 'unsupported' });
    }

    stop();
    setSpeaking(true);
    setError('');
    onStart?.();

    const chunks = splitSpeech(safeText);
    const selectedLang = LANG_MAP[options.lang || lang] || options.lang || lang;
    const startedAt = performance.now();
    const timings = [];
    let index = 0;

    return new Promise((resolve) => {
      const finish = (ok = true) => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        stopLipSync();
        utteranceRef.current = null;
        setSpeaking(false);
        onMouth?.(0);
        onEnd?.();
        resolve({ ok, timings, durationMs: Math.round(performance.now() - startedAt) });
      };

      const speakNext = () => {
        const chunk = chunks[index];
        if (!chunk) {
          finish(true);
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = selectedLang;
        utterance.rate = 1.02;
        utterance.pitch = options.emotion === 'happy' ? 1.08 : 1;
        utterance.volume = 1;

        utterance.onstart = () => {
          console.warn('[LipSync] Browser SpeechSynthesis audio cannot be analysed reliably; avatar mouth remains static unless audio-element TTS is used.');
        };

        utterance.onboundary = (event) => {
          const timing = { chunk: index, charIndex: event.charIndex || 0, elapsedMs: Math.round(performance.now() - startedAt) };
          timings.push(timing);
          onBoundary?.(timing);
          // Boundary timing is recorded only; no fake mouth movement is applied.
        };

        utterance.onend = () => {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          onMouth?.(0);
          index += 1;
          window.setTimeout(speakNext, 90);
        };

        utterance.onerror = () => {
          setError('A hangos válasz megszakadt.');
          finish(false);
        };

        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      };

      speakNext();
    });
  }, [lang, onBoundary, onEnd, onMouth, onStart, stop]);

  return { speak, stop, speaking, error, supported: typeof window !== 'undefined' && 'speechSynthesis' in window };
}