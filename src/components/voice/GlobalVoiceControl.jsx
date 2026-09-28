import { useEffect, useCallback, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2, MessageCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useVoiceRuntime } from '@/hooks/useVoiceRuntime';
import {
  executeResolvedGlobalUiCommand,
  getRecognitionLangFromText,
  resolveGlobalUiCommand,
} from '@/lib/globalVoiceNavigator';
import { executeGlobalVoiceCommand } from '@/lib/globalVoiceActions';
import { requestMicrophonePermission } from '@/lib/microphonePermission';

export default function GlobalVoiceControl() {
  const location = useLocation();
  const navigate = useNavigate();
  const voice = useVoiceRuntime();
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [resultText, setResultText] = useState('');
  const handledEventIdsRef = useRef(new Set());

  const micEnabled = voice.state.handsFree;
  const micLive = voice.state.handsFree && (voice.state.isListening || voice.state.isRecognitionActive || voice.state.isRecognitionStarting);

  useEffect(() => {
    // Chat/Home already own the same runtime and handle voice there.
    if (location.pathname === '/' || location.pathname === '/chat') return undefined;

    const event = voice.lastTranscriptEvent;
    if (!event?.id || !event.text || handledEventIdsRef.current.has(event.id)) return undefined;

    // The dedicated full-screen voice tool owns commands while its overlay is active.
    if (document.querySelector('[data-jarvis-voice-command-overlay="true"]')) return undefined;

    handledEventIdsRef.current.add(event.id);
    if (handledEventIdsRef.current.size > 250) {
      handledEventIdsRef.current = new Set([event.id]);
    }

    const currentTranscript = event.text.trim();
    const detectedRecognitionLang = getRecognitionLangFromText(currentTranscript);
    if (detectedRecognitionLang) voice.setRecognitionLanguage(detectedRecognitionLang);

    let cancelled = false;
    setTranscript(currentTranscript);
    setResultText('');
    setIsProcessing(true);

    const run = async () => {
      try {
        const uiCommand = resolveGlobalUiCommand(currentTranscript);
        if (uiCommand) {
          const result = executeResolvedGlobalUiCommand(uiCommand, { navigate, voice });
          if (!cancelled) setResultText(result.reply || 'Rendben.');
          if (result.reply && !result.silent) await voice.speakText(result.reply, 'hu');
          return;
        }

        await voice.speakInstantAck?.('hu');
        const result = await executeGlobalVoiceCommand(currentTranscript);
        const reply = result?.reply || 'Rendben.';
        if (!cancelled) setResultText(reply);
        await voice.speakText(reply, 'hu');
      } catch (error) {
        const message = error?.message ? `Nem sikerült: ${error.message}` : 'A hangparancs végrehajtása nem sikerült.';
        if (!cancelled) setResultText(message);
        try { await voice.speakText('A művelet nem sikerült.', 'hu'); } catch {}
      } finally {
        if (!cancelled) {
          setIsProcessing(false);
          window.setTimeout(() => {
            if (!cancelled) {
              setTranscript('');
              setResultText('');
            }
          }, 2200);
        }
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [voice.lastTranscriptEvent?.id, location.pathname, navigate, voice]);

  const toggleListening = useCallback(async () => {
    const next = !voice.state.handsFree;
    if (next) {
      const permission = await requestMicrophonePermission();
      if (!permission.ok) {
        alert(permission.message);
        return;
      }
    }
    voice.setHandsFree(next);
  }, [voice]);

  return (
    <>
      <AnimatePresence>
        {(transcript || resultText) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-[88px] left-4 right-4 max-w-md mx-auto z-40 pointer-events-none"
          >
            <div className="bg-card border border-border rounded-2xl px-4 py-3 shadow-lg">
              <div className="flex items-start gap-2">
                {isProcessing ? (
                  <Loader2 size={14} className="text-primary animate-spin shrink-0 mt-0.5" />
                ) : (
                  <MessageCircle size={14} className="text-primary shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  {transcript && <p className="text-xs text-foreground italic">„{transcript}"</p>}
                  {resultText && <p className="text-xs text-muted-foreground mt-1">{resultText}</p>}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={toggleListening}
        whileTap={{ scale: 0.88 }}
        aria-label={micEnabled ? 'Mikrofon kikapcsolása' : 'Mikrofon bekapcsolása'}
        aria-pressed={micEnabled}
        className={`fixed bottom-[72px] right-4 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all ${
          micEnabled ? 'bg-red-500' : isProcessing ? 'bg-primary/70' : 'bg-primary'
        } ${micLive ? 'ring-4 ring-red-400/40 animate-pulse' : micEnabled ? 'ring-4 ring-red-400/20' : ''}`}
      >
        {isProcessing ? (
          <Loader2 size={22} className="text-white animate-spin" />
        ) : micLive ? (
          <Mic size={22} className="text-white" />
        ) : micEnabled ? (
          <Loader2 size={22} className="text-white animate-spin" />
        ) : (
          <MicOff size={22} className="text-white" />
        )}
      </motion.button>
    </>
  );
}
