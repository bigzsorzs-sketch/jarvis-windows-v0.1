import { useEffect, useRef } from 'react';
import { analyzeMoodAsync } from '@/lib/moodWorker';

export function useChatVoiceBridge({ voice, setInput, sendMessageRef, setUserMood }) {
  const cycleLockedRef = useRef(false);

  useEffect(() => {
    if (!voice.runtime) return undefined;

    const unsubscribe = voice.runtime.subscribe('transcript', async (transcript) => {
      if (cycleLockedRef.current) {
        console.warn('[voiceBridge] Duplicate transcript ignored while cycle is locked');
        return;
      }
      cycleLockedRef.current = true;
      const startedAt = performance.now();
      console.info('[voiceBridge] Voice cycle started', { transcript });
      try {
        voice.speakInstantAck?.('hu');
        setInput(transcript);
        analyzeMoodAsync(transcript, (mood) => setUserMood(mood));
        await sendMessageRef.current?.(transcript);
        const latencyMs = Math.round(performance.now() - startedAt);
        voice.runtime?.completeVoiceCycle?.(latencyMs, latencyMs > 5000 ? 'latency_timeout' : 'completed');
        if (voice.runtime?.getState?.().handsFree) voice.runtime?.resumeListening?.();
      } finally {
        cycleLockedRef.current = false;
      }
    });

    return () => unsubscribe?.();
  }, [voice.runtime, setInput, sendMessageRef, setUserMood]);
}