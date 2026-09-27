import { useEffect, useCallback, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2, MessageCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useVoiceRuntime } from '@/hooks/useVoiceRuntime';
import { getRecognitionLangFromText } from '@/lib/globalVoiceNavigator';
import { requestMicrophonePermission } from '@/lib/microphonePermission';

export default function GlobalVoiceControl() {
  const location = useLocation();
  const navigate = useNavigate();
  const voice = useVoiceRuntime();
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const handledTranscriptRef = useRef('');

  const micEnabled = voice.state.handsFree;
  const micLive = voice.state.handsFree && (voice.state.isListening || voice.state.isRecognitionActive || voice.state.isRecognitionStarting);

  useEffect(() => {
    const currentTranscript = voice.lastTranscript?.trim();
    if (!currentTranscript || handledTranscriptRef.current === currentTranscript) return;
    handledTranscriptRef.current = currentTranscript;

    const detectedRecognitionLang = getRecognitionLangFromText(currentTranscript);
    if (detectedRecognitionLang) {
      voice.setRecognitionLanguage(detectedRecognitionLang);
    }

    setTranscript(currentTranscript);
    setIsProcessing(true);

    if (location.pathname !== '/chat' && location.pathname !== '/live-assistant') {
      navigate('/live-assistant');
    }

    const timer = setTimeout(() => {
      setTranscript('');
      setIsProcessing(false);
    }, 1200);

    return () => clearTimeout(timer);
  }, [voice.lastTranscript, navigate, voice, location.pathname]);

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

    if (next && location.pathname !== '/live-assistant') {
      navigate('/live-assistant');
    }
  }, [voice, navigate, location.pathname]);

  return (
    <>
      <AnimatePresence>
        {transcript && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-[88px] left-4 right-4 max-w-md mx-auto z-40 pointer-events-none"
          >
            <div className="bg-card border border-border rounded-2xl px-4 py-3 shadow-lg">
              <div className="flex items-center gap-2">
                {isProcessing ? (
                  <Loader2 size={14} className="text-primary animate-spin shrink-0" />
                ) : (
                  <MessageCircle size={14} className="text-primary shrink-0" />
                )}
                <p className="text-xs text-foreground flex-1 italic">„{transcript}"</p>
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