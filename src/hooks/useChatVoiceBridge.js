import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyzeMoodAsync } from '@/lib/moodWorker';
import { executeResolvedGlobalUiCommand, resolveGlobalUiCommand } from '@/lib/globalVoiceNavigator';
import { takeQueuedVoiceCommand } from '@/lib/voiceCommandQueue';

export function useChatVoiceBridge({ voice, setInput, sendMessageRef, setUserMood }) {
  const cycleLockedRef = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const queued = takeQueuedVoiceCommand();
      if (!queued?.text || !sendMessageRef.current) return;

      cycleLockedRef.current = true;
      const startedAt = performance.now();
      try {
        setInput(queued.text);
        analyzeMoodAsync(queued.text, (mood) => setUserMood(mood));
        await sendMessageRef.current(queued.text);
        const latencyMs = Math.round(performance.now() - startedAt);
        voice.runtime?.completeVoiceCycle?.(latencyMs, latencyMs > 5000 ? 'latency_timeout' : 'completed');
        if (voice.runtime?.getState?.().handsFree) voice.runtime?.resumeListening?.();
      } finally {
        cycleLockedRef.current = false;
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [voice.runtime, setInput, sendMessageRef, setUserMood]);

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
        const uiCommand = resolveGlobalUiCommand(transcript);
        if (uiCommand) {
          const result = executeResolvedGlobalUiCommand(uiCommand, { navigate, voice });
          if (result.reply && !result.silent) await voice.speakText(result.reply, 'hu');
          const latencyMs = Math.round(performance.now() - startedAt);
          voice.runtime?.completeVoiceCycle?.(latencyMs, 'ui_command');
          if (voice.runtime?.getState?.().handsFree) voice.runtime?.resumeListening?.();
          return;
        }

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
  }, [voice.runtime, voice, setInput, sendMessageRef, setUserMood, navigate]);
}
