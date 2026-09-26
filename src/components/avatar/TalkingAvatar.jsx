import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Mic, MicOff, Send, Volume2 } from 'lucide-react';
import { jarvis } from '@/api/jarvisClient';
import AvatarScene from '@/avatar/AvatarScene';
import SketchfabAvatarFrame, { isSketchfabAvatarUrl } from '@/components/avatar/SketchfabAvatarFrame';
import { useAvatarAnimation } from '@/avatar/useAvatarAnimation';
import { useTTS } from '@/avatar/useTTS';
import { useVoiceInput } from '@/avatar/useVoiceInput';

const DEFAULT_LABELS = {
  listening: 'Figyelek',
  thinking: 'Gondolkodom',
  speaking: 'Beszélek',
  idle: 'Készen állok',
  micOff: 'Mikrofon kikapcsolva',
  inputPlaceholder: 'Írj üzenetet...',
  send: 'Küldés',
  fallbackText: 'A 3D avatar tartalék módban fut.',
};

function normalizeEmotion(value) {
  if (['happy', 'joy', 'worried', 'anger', 'thinking', 'error'].includes(value)) return value;
  return 'neutral';
}

function expressionToEmotion(expression) {
  if (expression === 'thinking') return 'thinking';
  if (['happy', 'joy', 'worried', 'anger', 'error'].includes(expression)) return expression;
  if (expression === 'speaking' || expression === 'listening') return 'neutral';
  return normalizeEmotion(expression);
}

export default function TalkingAvatar({
  avatarUrl = '',
  enableVoice = true,
  externalExpression = 'neutral',
  lang = 'hu',
  labels = {},
  compact = false,
  onMessage,
}) {
  const ui = { ...DEFAULT_LABELS, ...labels };
  const animation = useAvatarAnimation(expressionToEmotion(externalExpression));
  const [handsFree, setHandsFree] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [input, setInput] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [fallback, setFallback] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    animation.setEmotion(expressionToEmotion(externalExpression));
    animation.setSpeaking(externalExpression === 'speaking');
    animation.setListening(externalExpression === 'listening');
  }, [externalExpression]);

  const tts = useTTS({
    lang,
    onStart: () => {
      setPhase('speaking');
      animation.setSpeaking(true);
    },
    onEnd: () => {
      setPhase(handsFree ? 'listening' : 'idle');
      animation.setSpeaking(false);
      animation.setMouthOpen(0);
    },
    onMouth: animation.setMouthOpen,
    onBoundary: () => animation.pulseMouthFromText(lastReply),
  });

  const askAssistant = useCallback(async (text) => {
    const clean = String(text || '').trim();
    if (!clean) return;

    setPhase('thinking');
    animation.setEmotion('thinking');
    animation.setListening(false);
    const nextHistory = [...history.slice(-6), { role: 'user', content: clean }];
    setHistory(nextHistory);

    const response = await jarvis.functions.invoke('llmProxy', {
      prompt: `Válaszolj röviden és természetesen a felhasználónak ezen a nyelven: ${lang}.\nFelhasználó: ${clean}`,
      response_json_schema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          emotion: { type: 'string', enum: ['neutral', 'happy', 'thinking'] }
        },
        required: ['text']
      }
    });

    const result = response?.data?.data?.result;
    const structured = typeof result === 'string' ? { text: result, emotion: 'neutral' } : result;
    const reply = structured?.text || 'Rendben.';
    const emotion = normalizeEmotion(structured?.emotion);
    setLastReply(reply);
    setHistory([...nextHistory, { role: 'assistant', content: reply }]);
    animation.setEmotion(emotion);
    onMessage?.({ user: clean, assistant: reply, emotion });

    const spoken = await tts.speak(reply, { lang, emotion });
    if (!spoken.ok) {
      setFallback(reply);
      setPhase('idle');
    }
  }, [animation, history, lang, onMessage, tts]);

  const voice = useVoiceInput({
    lang: lang === 'hu' ? 'hu-HU' : lang,
    enabled: enableVoice && handsFree,
    onTranscript: askAssistant,
    onStateChange: (status) => {
      if (status === 'listening') {
        setPhase('listening');
        animation.setListening(true);
      }
    },
  });

  const statusLabel = useMemo(() => {
    if (!enableVoice) return externalExpression === 'speaking' ? ui.speaking : ui.idle;
    if (phase === 'speaking' || tts.speaking) return ui.speaking;
    if (phase === 'thinking') return ui.thinking;
    if (handsFree && voice.status === 'listening') return ui.listening;
    if (!handsFree) return ui.micOff;
    return ui.idle;
  }, [enableVoice, externalExpression, handsFree, phase, tts.speaking, ui, voice.status]);

  const submit = async (event) => {
    event?.preventDefault?.();
    const clean = input.trim();
    if (!clean) return;
    setInput('');
    await askAssistant(clean);
  };

  return (
    <div className={`relative flex h-full min-h-[260px] w-full flex-col overflow-hidden rounded-[2rem] ${compact ? '' : 'bg-card/70 border border-border'}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.22),transparent_52%)]" />
      <div className="relative flex-1 min-h-[250px]">
        {isSketchfabAvatarUrl(avatarUrl) ? (
          <SketchfabAvatarFrame url={avatarUrl} />
        ) : (
          <AvatarScene avatarUrl={avatarUrl} animationStateRef={animation.animationStateRef} onFallback={() => setFallback(ui.fallbackText)} />
        )}
      </div>

      {!compact ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <div className="flex items-center gap-2 rounded-full border border-border bg-background/75 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
            {phase === 'thinking' && <Loader2 size={12} className="animate-spin text-primary" />}
            {phase === 'speaking' && <Volume2 size={12} className="text-primary" />}
            {phase === 'listening' && <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />}
            {statusLabel}
          </div>
        </div>
      ) : null}

      {enableVoice && !compact && (
        <div className="relative z-10 space-y-2 border-t border-border bg-background/80 p-3 backdrop-blur">
          {(voice.error || tts.error || fallback) && (
            <p className="rounded-xl border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
              {voice.error || tts.error || fallback}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHandsFree((value) => !value)}
              className={`h-11 w-11 rounded-2xl flex items-center justify-center ${handsFree ? 'bg-red-500 text-white' : 'bg-primary text-primary-foreground'}`}
            >
              {handsFree ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <form onSubmit={submit} className="flex flex-1 items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={ui.inputPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button type="submit" className="text-primary" aria-label={ui.send}>
                <Send size={17} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}