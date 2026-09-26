import { useCallback, useMemo, useRef } from 'react';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function useAvatarAnimation(initialEmotion = 'neutral') {
  const stateRef = useRef({
    emotion: initialEmotion,
    expressionIntensity: 0.75,
    mouthOpen: 0,
    lipSyncLevel: 0,
    isSpeaking: false,
    isListening: false,
    isThinking: false,
    audioLevel: 0,
    lastSpeechAt: 0,
  });

  const setEmotion = useCallback((emotion = 'neutral') => {
    stateRef.current.emotion = ['happy', 'joy', 'worried', 'anger', 'thinking', 'neutral', 'error'].includes(emotion) ? emotion : 'neutral';
    stateRef.current.expressionIntensity = stateRef.current.emotion === 'neutral' ? 0 : 0.8;
    stateRef.current.isThinking = stateRef.current.emotion === 'thinking';
  }, []);

  const setMouthOpen = useCallback((level = 0) => {
    stateRef.current.mouthOpen = clamp01(level);
    stateRef.current.audioLevel = clamp01(level);
    if (level > 0.04) stateRef.current.lastSpeechAt = performance.now();
  }, []);

  const setSpeaking = useCallback((active) => {
    stateRef.current.isSpeaking = Boolean(active);
    if (!active) stateRef.current.mouthOpen = 0;
  }, []);

  const setListening = useCallback((active) => {
    stateRef.current.isListening = Boolean(active);
  }, []);

  const pulseMouthFromText = useCallback(() => {
    // Real lip sync is driven only by audio analyser amplitude.
  }, []);

  return useMemo(() => ({
    animationStateRef: stateRef,
    setEmotion,
    setMouthOpen,
    setSpeaking,
    setListening,
    pulseMouthFromText,
  }), [setEmotion, setMouthOpen, setSpeaking, setListening, pulseMouthFromText]);
}