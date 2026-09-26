import { useCallback, useEffect, useRef, useState } from 'react';

const RESTART_DELAY_MS = 900;
const MAX_RESTARTS_PER_MINUTE = 12;
const DUPLICATE_WINDOW_MS = 1800;

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function useVoiceInput({ lang = 'hu-HU', enabled = false, onTranscript, onStateChange } = {}) {
  const recognitionRef = useRef(null);
  const restartTimerRef = useRef(null);
  const shouldRunRef = useRef(false);
  const activeRef = useRef(false);
  const startingRef = useRef(false);
  const lastTranscriptRef = useRef({ text: '', at: 0 });
  const restartTimesRef = useRef([]);
  const onTranscriptRef = useRef(onTranscript);
  const onStateChangeRef = useRef(onStateChange);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);

  const emitStatus = useCallback((next) => {
    setStatus(next);
    onStateChangeRef.current?.(next);
  }, []);

  const canRestart = useCallback(() => {
    const now = Date.now();
    restartTimesRef.current = restartTimesRef.current.filter((time) => now - time < 60000);
    return restartTimesRef.current.length < MAX_RESTARTS_PER_MINUTE;
  }, []);

  const stop = useCallback(() => {
    shouldRunRef.current = false;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    startingRef.current = false;
    activeRef.current = false;
    try { recognitionRef.current?.abort(); } catch {}
    emitStatus('idle');
  }, [emitStatus]);

  const start = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setError('A böngésző nem támogatja a folyamatos hangfelismerést.');
      emitStatus('unsupported');
      return false;
    }
    if (activeRef.current || startingRef.current) return true;
    if (!canRestart()) {
      setError('A mikrofon túl sokszor indult újra. Kérlek próbáld újra később.');
      emitStatus('error');
      return false;
    }

    shouldRunRef.current = true;
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = lang;

    recognition.onstart = () => {
      activeRef.current = true;
      startingRef.current = false;
      setError('');
      emitStatus('listening');
    };

    recognition.onresult = (event) => {
      const result = event.results?.[event.results.length - 1];
      const text = result?.[0]?.transcript?.trim();
      if (!text || result?.isFinal === false) return;

      const now = Date.now();
      const last = lastTranscriptRef.current;
      if (last.text === text && now - last.at < DUPLICATE_WINDOW_MS) return;
      lastTranscriptRef.current = { text, at: now };
      onTranscriptRef.current?.(text);
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Mikrofon hozzáférés szükséges a hands-free módhoz.');
        shouldRunRef.current = false;
        emitStatus('error');
        return;
      }
      if (event.error !== 'aborted') setError('A mikrofon kapcsolat megszakadt, újraindítom.');
    };

    recognition.onend = () => {
      activeRef.current = false;
      startingRef.current = false;
      if (!shouldRunRef.current) {
        emitStatus('idle');
        return;
      }
      emitStatus('restarting');
      restartTimerRef.current = window.setTimeout(() => {
        if (!shouldRunRef.current || !canRestart()) return;
        restartTimesRef.current.push(Date.now());
        start();
      }, RESTART_DELAY_MS);
    };

    recognitionRef.current = recognition;
    startingRef.current = true;
    restartTimesRef.current.push(Date.now());
    emitStatus('starting');
    try {
      recognition.start();
      return true;
    } catch {
      startingRef.current = false;
      emitStatus('error');
      return false;
    }
  }, [canRestart, emitStatus, lang]);

  useEffect(() => {
    if (enabled) start(); else stop();
    return stop;
  }, [enabled, start, stop]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (shouldRunRef.current) start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [start, stop]);

  return { status, error, start, stop, supported: Boolean(getSpeechRecognition()) };
}