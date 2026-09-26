/**
 * React hook to subscribe to voice runtime state and events.
 *
 * Usage:
 * const voice = useVoiceRuntime();
 * voice.state.handsFree // boolean
 * voice.toggleHandsFree() // function
 * voice.speakText(text, lang) // function
 *
 * Subscribes to:
 * - stateChange: { key, value }
 * - transcript: string
 * - error: { type, message }
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getVoiceRuntime } from '@/lib/voiceRuntime';

export function useVoiceRuntime() {
  const runtimeRef = useRef(null);
  const [state, setState] = useState(() => {
    runtimeRef.current = getVoiceRuntime();
    return runtimeRef.current.getState();
  });

  const [lastTranscript, setLastTranscript] = useState('');
  const [lastError, setLastError] = useState(null);

  useEffect(() => {
    const runtime = runtimeRef.current;

    // Subscribe to state changes
    const unsubState = runtime.subscribe('stateChange', (changes) => {
      setState(prev => ({ ...prev, ...changes }));
    });

    // Subscribe to transcripts (for optional consumption)
    const unsubTranscript = runtime.subscribe('transcript', (transcript) => {
      setLastTranscript(transcript);
    });

    // Subscribe to errors
    const unsubError = runtime.subscribe('error', (error) => {
      setLastError(error);
    });

    return () => {
      unsubState?.();
      unsubTranscript?.();
      unsubError?.();
    };
  }, []);

  // Expose public API
  return {
    state,
    lastTranscript,
    lastError,
    toggleHandsFree: useCallback(() => {
      runtimeRef.current?.toggleHandsFree();
    }, []),
    startSingleCycle: useCallback(() => {
      return runtimeRef.current?.startSingleCycle();
    }, []),
    completeVoiceCycle: useCallback((latencyMs, reason) => {
      return runtimeRef.current?.completeVoiceCycle(latencyMs, reason);
    }, []),
    setHandsFree: useCallback((enabled) => {
      runtimeRef.current?.setHandsFree(enabled);
    }, []),
    toggleAutoSpeakReplies: useCallback(() => {
      return runtimeRef.current?.toggleAutoSpeakReplies();
    }, []),
    speakText: useCallback((text, lang, options) => {
      return runtimeRef.current?.speakText(text, lang, options);
    }, []),
    speakInstantAck: useCallback((lang) => {
      return runtimeRef.current?.speakInstantAck(lang);
    }, []),
    setRecognitionLanguage: useCallback((lang) => {
      runtimeRef.current?.setRecognitionLanguage(lang);
    }, []),
    clearError: useCallback(() => {
      setLastError(null);
    }, []),
    clearTranscript: useCallback(() => {
      setLastTranscript('');
    }, []),
    // For advanced usage
    runtime: runtimeRef.current,
  };
}