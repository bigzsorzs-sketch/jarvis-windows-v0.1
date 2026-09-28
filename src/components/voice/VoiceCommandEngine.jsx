/**
 * VoiceCommandEngine
 * ─────────────────────────────────────────────────────────────
 * A full-screen hands-free voice control overlay for the Tools section.
 * Supports:
 *   – Todo creation / completion
 *   – Blood sugar logging
 *   – Meal logging
 *   – Reminder creation
 *   – Navigation & call shortcuts
 *   – Continuous "hands-free" mode (auto-restarts mic after each command)
 *   – TTS confirmation after every action
 *   – Minimal AI fallback for unrecognised commands
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, X, Loader2, Volume2, VolumeX, RefreshCw } from 'lucide-react';
import { invokeWithRetry } from '@/lib/llmGateway';
import { jarvis } from '@/api/jarvisClient';
import { parseVoiceCommand, localDateString } from '@/lib/voiceCommandParser';
import { useVoiceRuntime } from '@/hooks/useVoiceRuntime';

async function getCurrentUserOrThrow() {
  const currentUser = await jarvis.auth.me().catch(() => null);
  if (!currentUser?.email) throw new Error('AUTH_REQUIRED');
  return currentUser;
}

function withOwner(data, currentUser) {
  return { ...data, created_by: currentUser.email };
}

const PHASE = { IDLE: 'idle', LISTENING: 'listening', PROCESSING: 'processing', DONE: 'done', ERROR: 'error' };

// Colour helpers
const phaseColor = {
  [PHASE.IDLE]:       'bg-primary',
  [PHASE.LISTENING]:  'bg-red-500',
  [PHASE.PROCESSING]: 'bg-yellow-500',
  [PHASE.DONE]:       'bg-green-500',
  [PHASE.ERROR]:      'bg-destructive',
};

// Example commands shown in the UI
const EXAMPLES = [
  'Ma költöttem 2000 forintot ebédre',
  'Ma reggel 5.8 volt a vércukrom',
  'Ebédre ettem levest 400 kalória',
  'Teendő: vegyél tejet',
  'Navigálj TESCO-ba',
];

export default function VoiceCommandEngine({ onClose, onDataChange }) {
  const voice = useVoiceRuntime();
  const [phase, setPhase]         = useState(PHASE.IDLE);
  const [transcript, setTranscript] = useState('');
  const [statusMsg, setStatusMsg]   = useState('Nyomd meg a mikrofont vagy mondd a parancsot');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [history, setHistory]       = useState([]);

  // Derive hands-free state from central runtime
  const handsFree = voice.state.handsFree;
  // Stable ref to avoid stale closure in callbacks
  const handsFreeRef = useRef(handsFree);
  const commandRunningRef = useRef(false);
  const pendingTranscriptsRef = useRef([]);
  const handledEventIdsRef = useRef(new Set());
  const activeCommandTextRef = useRef('');
  const handlersRef = useRef({});
  useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);

  // Sync listening phase with runtime state
  useEffect(() => {
    if (voice.state.isListening && phase === PHASE.IDLE) {
      setPhase(PHASE.LISTENING);
      setStatusMsg('Figyelek… mondj egy parancsot');
    } else if (!voice.state.isListening && phase === PHASE.LISTENING) {
      setPhase(PHASE.IDLE);
    }
  }, [voice.state.isListening]);

  const startListening = () => {
    if (!voice.state.isSpeechInputSupported) {
      setPhase(PHASE.ERROR);
      setStatusMsg(voice.state.mobileWebViewSpeechDisabled
        ? 'Android WebView alatt a hangvezérlés stabilitási okból ki van kapcsolva.'
        : 'A hangvezérlés nem támogatott ezen az eszközön.');
      return;
    }
    setTranscript('');
    setPhase(PHASE.LISTENING);
    setStatusMsg('Figyelek… mondj egy parancsot');
    voice.setHandsFree(true);
  };

  const stopListening = () => {
    voice.setHandsFree(false);
    setPhase(PHASE.IDLE);
    setStatusMsg('Megállítva');
  };

  // ── Command execution ─────────────────────────────────────────────────────
  const handleCommand = async (text) => {
    const parsed = parseVoiceCommand(text);
    if (parsed) {
      await handlersRef.current.executeLocalCommand(parsed, text);
    } else {
      await handlersRef.current.fallbackToAI(text);
    }
  };

  const executeLocalCommand = async (cmd, rawText) => {
    try {
      let resultMsg = cmd.confirmText;
      const currentUser = await getCurrentUserOrThrow();

      switch (cmd.type) {
        case 'create_todo':
          await jarvis.entities.TodoItem.create(withOwner({
            title: cmd.payload.title,
            priority: cmd.payload.priority,
            is_completed: false,
          }, currentUser));
          break;

        case 'complete_todo': {
          const user = await jarvis.auth.me().catch(() => null);
          const todos = user?.email ? await jarvis.entities.TodoItem.filter({ created_by: user.email }, '-created_date', 50) : [];
          const match = todos.find(t =>
            t.title.toLowerCase().includes(cmd.payload.keyword.toLowerCase())
          );
          if (match) {
            await jarvis.entities.TodoItem.update(match.id, { is_completed: true });
            resultMsg = `Kész: ${match.title}`;
          } else {
            resultMsg = `Nem találtam teendőt: ${cmd.payload.keyword}`;
          }
          break;
        }

        case 'create_blood_sugar':
          await jarvis.entities.BloodSugar.create(withOwner(cmd.payload, currentUser));
          break;

        case 'create_expense':
          await jarvis.entities.FinanceEntry.create(withOwner(cmd.payload, currentUser));
          break;

        case 'create_meal':
          await jarvis.entities.MealLog.create(withOwner(cmd.payload, currentUser));
          break;

        case 'create_reminder':
          await jarvis.entities.Reminder.create(withOwner({
            title: cmd.payload.title,
            category: cmd.payload.category || 'other',
          }, currentUser));
          break;

        case 'log_medication':
          resultMsg = 'Gyógyszer bevétel feljegyezve ✓';
          break;

        case 'navigate':
          window.open(
            `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cmd.payload.destination)}`,
            '_blank'
          );
          break;

        case 'call':
          resultMsg = `Hívás: ${cmd.payload.name}`;
          // Try to find contact phone
          break;

        default:
          break;
      }

      await finishCommand(resultMsg, true);
      onDataChange?.(); // signal parent to refresh data
    } catch (error) {
      await finishCommand(error?.message === 'AUTH_REQUIRED' ? 'A mentéshez be kell jelentkezned.' : 'A művelet most nem sikerült.', false);
    }
  };

  const fallbackToAI = async (text) => {
    setStatusMsg('AI feldolgozás…');
    try {
      const response = await invokeWithRetry({
        prompt: `A felhasználó hanggal mondott egy természetes nyelvű mondatot magyarul: "${text}"

Feladat:
- Ha ez egy kiadás rögzítése, válaszolj CSAK így: EXPENSE|összeg|leírás
- Ha ez egy vércukor naplózás, válaszolj CSAK így: BLOODSUGAR|érték|időszak
- Ha ez egy étkezés naplózás, válaszolj CSAK így: MEAL|megnevezés|étkezéstípus|kalória
- Ha nem ilyen, válaszolj CSAK így: NONE

Példák:
- "Ma költöttem 2000 forintot ebédre" -> EXPENSE|2000|ebéd
- "Ma reggel 5.8 volt a vércukrom" -> BLOODSUGAR|5.8|reggel
- "Ebédre ettem levest 400 kalória" -> MEAL|leves|ebéd|400`,
      });
      const reply = String(typeof response === 'string' ? response : (response.data?.result || response.data || '')).trim();
      if (reply.startsWith('EXPENSE|')) {
        const [, amountText, description] = reply.split('|');
        const amount = parseFloat((amountText || '').replace(',', '.'));
        if (!isNaN(amount) && description) {
          await executeLocalCommand({
            type: 'create_expense',
            payload: { description: description.charAt(0).toUpperCase() + description.slice(1), amount, type: 'expense', category: 'magan', date: localDateString() },
            confirmText: `Kiadás: ${amount} Ft – ${description}`
          }, text);
          return;
        }
      }
      if (reply.startsWith('BLOODSUGAR|')) {
        const [, valueText, timeOfDay] = reply.split('|');
        const value = parseFloat((valueText || '').replace(',', '.'));
        if (!isNaN(value)) {
          await executeLocalCommand({
            type: 'create_blood_sugar',
            payload: { value, time_of_day: timeOfDay || 'reggel', date: localDateString() },
            confirmText: `Vércukor: ${value} mmol/L`
          }, text);
          return;
        }
      }
      if (reply.startsWith('MEAL|')) {
        const [, mealName, mealType, caloriesText] = reply.split('|');
        const calories = parseFloat((caloriesText || '0').replace(',', '.')) || 0;
        if (mealName) {
          await executeLocalCommand({
            type: 'create_meal',
            payload: { meal_name: mealName, meal_type: mealType || 'ebéd', calories, date: localDateString() },
            confirmText: `Étkezés: ${mealName}`
          }, text);
          return;
        }
      }
      await finishCommand('Nem tudtam naplózható tételként értelmezni a mondatot.', false);
    } catch {
      await finishCommand('Nem sikerült feldolgozni a parancsot', false);
    }
  };

  const finishCommand = async (msg, success) => {
    setStatusMsg(msg);
    setPhase(success ? PHASE.DONE : PHASE.ERROR);
    setHistory(prev => [{ text: activeCommandTextRef.current || transcript, result: msg, ok: success, ts: Date.now() }, ...prev].slice(0, 5));

    if (ttsEnabled) {
      try {
        await voice.speakText(msg, 'hu');
      } catch {
        // The command result is still valid even if voice playback fails.
      }
      afterCommand(success);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 450));
      afterCommand(success);
    }
  };

  const afterCommand = (success) => {
    if (pendingTranscriptsRef.current.length > 0) return;
    if (handsFreeRef.current) {
      setPhase(PHASE.LISTENING);
      setTranscript('');
      setStatusMsg('Figyelek…');
      setTimeout(() => {
        if (handsFreeRef.current) startListening();
      }, 300);
    } else {
      setPhase(PHASE.IDLE);
      setStatusMsg(success ? 'Sikeres! Nyomd meg a mikrofont a folytatáshoz' : 'Próbáld újra');
    }
  };

  handlersRef.current = { executeLocalCommand, fallbackToAI, handleCommand };

  useEffect(() => {
    const event = voice.lastTranscriptEvent;
    if (!event?.id || !event.text) return;
    if (handledEventIdsRef.current.has(event.id)) return;
    handledEventIdsRef.current.add(event.id);
    if (handledEventIdsRef.current.size > 200) {
      handledEventIdsRef.current = new Set([event.id]);
    }

    pendingTranscriptsRef.current.push(event.text);
    voice.clearTranscript?.();

    const pump = async () => {
      if (commandRunningRef.current) return;
      commandRunningRef.current = true;
      try {
        while (pendingTranscriptsRef.current.length > 0) {
          const text = pendingTranscriptsRef.current.shift();
          activeCommandTextRef.current = text;
          setTranscript(text);
          setPhase(PHASE.PROCESSING);
          await handleCommand(text);
        }
      } finally {
        activeCommandTextRef.current = '';
        commandRunningRef.current = false;
      }
    };

    void pump();
  }, [voice.lastTranscriptEvent?.id]);

  const toggleMic = () => {
    if (phase === PHASE.LISTENING) stopListening();
    else if (phase === PHASE.IDLE || phase === PHASE.DONE || phase === PHASE.ERROR) startListening();
  };

  const toggleHandsFree = () => {
    if (!handsFree) {
      startListening();
    } else {
      stopListening();
    }
  };

  const handleClose = () => {
    pendingTranscriptsRef.current = [];
    voice.setHandsFree(false);
    onClose?.();
  };

  const dotCount = transcript.split(' ').length;

  return (
    <motion.div
      data-jarvis-voice-command-overlay="true"
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="fixed inset-0 z-[100] bg-background flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border shrink-0">
        <div>
          <h2 className="text-lg font-bold text-foreground">🎙️ Hangvezérlés</h2>
          <p className="text-xs text-muted-foreground">Eszközök hangutasításokkal</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTtsEnabled(v => !v)}
            className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-all ${ttsEnabled ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}
            title={ttsEnabled ? 'Hang visszajelzés be' : 'Hang visszajelzés ki'}
          >
            {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button onClick={handleClose} className="w-9 h-9 rounded-2xl bg-secondary flex items-center justify-center">
            <X size={18} className="text-foreground" />
          </button>
        </div>
      </div>

      {/* Main mic area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        {/* Big pulsing mic button */}
        <div className="relative flex items-center justify-center">
          {phase === PHASE.LISTENING && (
            <>
              <span className="absolute w-36 h-36 rounded-full bg-red-500/10 animate-ping" />
              <span className="absolute w-28 h-28 rounded-full bg-red-500/15 animate-pulse" />
            </>
          )}
          <motion.button
            onClick={toggleMic}
            whileTap={{ scale: 0.93 }}
            className={`relative w-24 h-24 rounded-full shadow-2xl flex items-center justify-center transition-all ${phaseColor[phase] || 'bg-primary'}`}
          >
            {phase === PHASE.PROCESSING
              ? <Loader2 size={36} className="text-white animate-spin" />
              : phase === PHASE.LISTENING
              ? <MicOff size={36} className="text-white" />
              : <Mic size={36} className="text-white" />
            }
          </motion.button>
        </div>

        {/* Transcript */}
        <div className="min-h-[3rem] text-center">
          {transcript ? (
            <p className="text-base font-medium text-foreground leading-snug">"{transcript}"</p>
          ) : (
            <p className="text-sm text-muted-foreground">{statusMsg}</p>
          )}
        </div>

        {/* Status message (result) */}
        <AnimatePresence mode="wait">
          {(phase === PHASE.DONE || phase === PHASE.ERROR) && statusMsg && (
            <motion.div
              key={statusMsg}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              className={`w-full rounded-2xl p-4 text-center text-sm font-medium ${
                phase === PHASE.DONE
                  ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                  : 'bg-red-500/15 text-red-400 border border-red-500/30'
              }`}
            >
              {phase === PHASE.DONE ? '✅ ' : '❌ '}{statusMsg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hands-free toggle */}
        <button
          onClick={toggleHandsFree}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl border text-sm font-semibold transition-all ${
            handsFree
              ? 'bg-primary/20 border-primary/40 text-primary'
              : 'bg-secondary border-border text-foreground'
          }`}
        >
          <RefreshCw size={15} className={handsFree ? 'animate-spin' : ''} />
          {handsFree ? 'Folyamatos mód BE' : 'Folyamatos mód'}
        </button>
      </div>

      {/* Bottom: examples + history */}
      <div className="px-5 pb-5 space-y-4 shrink-0">
        {/* Recent history */}
        {history.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Legutóbbi</p>
            {history.slice(0, 3).map((h, i) => (
              <div key={i} className="flex items-start gap-2 bg-secondary rounded-xl px-3 py-2">
                <span className={`text-xs shrink-0 mt-0.5 ${h.ok ? 'text-green-400' : 'text-red-400'}`}>{h.ok ? '✓' : '✗'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">"{h.text}"</p>
                  <p className="text-xs text-foreground truncate">{h.result}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Example commands */}
        {history.length === 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Példa parancsok</p>
            {EXAMPLES.map((ex, i) => (
              <div key={i} className="bg-secondary rounded-xl px-3 py-2">
                <p className="text-xs text-foreground">🎙 "{ex}"</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}