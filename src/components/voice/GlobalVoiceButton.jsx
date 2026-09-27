import { useState, useEffect, useCallback, useRef } from 'react';

import { Mic, MicOff, Loader2, X, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { loadFullContext, buildSystemPrompt, parseActions, executeActions } from '@/lib/assistantTools';
import { invokeWithRetry } from '@/lib/llmGateway';
import VoiceCommandEngine from './VoiceCommandEngine';
import { useLocation } from 'react-router-dom';
import { useVoiceRuntime } from '@/hooks/useVoiceRuntime';

const IDLE = 'idle';
const LISTENING = 'listening';
const PROCESSING = 'processing';
const DONE = 'done';

// Tools section paths — use full VoiceCommandEngine overlay
const TOOLS_PATHS = [
  '/eszkozok', '/tools/finance', '/tools/invoices', '/tools/calendar',
  '/tools/translate', '/tools/quick', '/contacts', '/reminders',
  '/smarthome', '/routines', '/retail', '/locations', '/habits',
];

export default function GlobalVoiceButton() {
  const location = useLocation();
  const voice = useVoiceRuntime();
  const [phase, setPhase] = useState(IDLE);
  const [transcript, setTranscript] = useState('');
  const [resultMsg, setResultMsg] = useState('');
  const [error, setError] = useState('');
  const [showEngine, setShowEngine] = useState(false);
  const ctxRef = useRef(null);

  const isToolsPath = TOOLS_PATHS.some(p => location.pathname.startsWith(p));
  const isChatPath = location.pathname === '/';

  // Lazy load context
  const getCtx = useCallback(async () => {
    if (!ctxRef.current) {
      ctxRef.current = await loadFullContext().catch(() => null);
    }
    return ctxRef.current;
  }, []);

  // Subscribe to voice runtime transcripts (only on non-chat, non-tools paths)
  useEffect(() => {
    if (isChatPath || isToolsPath || !voice.lastTranscript) return;
    setTranscript(voice.lastTranscript);
    setPhase(PROCESSING);
    processVoiceCommand(voice.lastTranscript);
  }, [voice.lastTranscript, isChatPath, isToolsPath]);

  const processVoiceCommand = async (text) => {
    try {
      const ctx = await getCtx();
      const systemPrompt = buildSystemPrompt(ctx, 'Mindig magyarul válaszolj. Légy tömör.');

      const response = await invokeWithRetry({
        prompt: `${systemPrompt}\n\nUser: ${text}\n\nAssistant:`,
        model: 'gemini_3_flash',
      });

      const reply = typeof response === 'string' ? response : (response.data?.result || response.data?.data || response.data || '');

      const actions = parseActions(reply);
      let resultText = reply.replace(/\[ACTION:[^\]]+\]/g, '').trim();

      if (actions.length > 0) {
        const results = await executeActions(actions);
        const successes = results.filter(r => r.result?.success).map(r => r.result.message).join(' ');
        resultText = successes || resultText;
        ctxRef.current = null;
      }

      setResultMsg(resultText.substring(0, 200));
      setPhase(DONE);

      setTimeout(() => {
        setPhase(IDLE);
        setTranscript('');
        setResultMsg('');
        setError('');
      }, 5000);

    } catch (err) {
      setError('Hiba: ' + (err?.message || 'AI nem válaszolt'));
      setPhase(IDLE);
    }
  };

  const toggle = useCallback(() => {
    if (isToolsPath) {
      setShowEngine(true);
      return;
    }
    if (!voice.state.handsFree && (phase === IDLE || phase === DONE)) {
      voice.setHandsFree(true);
      setTranscript('');
      setResultMsg('');
      setError('');
      setPhase(LISTENING);
    } else if (voice.state.handsFree && phase === LISTENING) {
      voice.setHandsFree(false);
      setPhase(IDLE);
    }
  }, [voice, phase, isToolsPath]);

  const dismiss = useCallback(() => {
    if (voice.state.handsFree) voice.setHandsFree(false);
    setPhase(IDLE);
    setTranscript('');
    setResultMsg('');
    setError('');
  }, [voice]);

  const micActive = voice.state.handsFree && phase === LISTENING;
  const isActive = phase !== IDLE;

  return (
    <>
      {/* Full VoiceCommandEngine overlay for tools section */}
      <AnimatePresence>
        {showEngine && (
          <VoiceCommandEngine
            onClose={() => setShowEngine(false)}
            onDataChange={() => { /* parent can hook in if needed */ }}
          />
        )}
      </AnimatePresence>

      {/* Floating mic button — hidden on Chat page */}
      {isChatPath ? null : <motion.button
        onClick={toggle}
        whileTap={{ scale: 0.92 }}
        className={`absolute bottom-20 right-4 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all ${
          isToolsPath
            ? 'bg-accent shadow-accent/30'
            : micActive
            ? 'bg-red-500 shadow-red-500/40'
            : phase === PROCESSING
            ? 'bg-yellow-500 shadow-yellow-500/30'
            : phase === DONE
            ? 'bg-green-500 shadow-green-500/30'
            : 'bg-primary shadow-primary/30'
        }`}
      >
        {micActive && !isToolsPath && <MicOff size={20} className="text-white" />}
        {phase === PROCESSING && !isToolsPath && <Loader2 size={18} className="text-white animate-spin" />}
        {phase === DONE && !isToolsPath && <CheckCircle2 size={18} className="text-white" />}
        {(!micActive && phase !== PROCESSING && phase !== DONE || isToolsPath) && <Mic size={20} className="text-white" />}

        {/* Pulse ring when listening */}
        {micActive && !isToolsPath && (
          <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />
        )}
        {/* Tools indicator dot */}
        {isToolsPath && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
        )}
      </motion.button>}

      {/* Overlay card for non-tools paths */}
      <AnimatePresence>
        {isActive && !isToolsPath && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-36 left-4 right-4 z-50 bg-card border border-border rounded-2xl p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {phase === LISTENING && '🎙️ Figyelem...'}
                {phase === PROCESSING && '⚙️ Feldolgozás...'}
                {phase === DONE && '✅ Kész'}
              </p>
              <button onClick={dismiss}><X size={14} className="text-muted-foreground" /></button>
            </div>

            {transcript && (
              <p className="text-sm text-foreground mb-2">
                <span className="text-muted-foreground">Te: </span>{transcript}
              </p>
            )}

            {phase === PROCESSING && (
              <div className="flex gap-1 mt-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            )}

            {resultMsg && (
              <p className="text-sm text-foreground mt-1 leading-relaxed">{resultMsg}</p>
            )}

            {error && (
              <p className="text-sm text-red-400 mt-1">{error}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}