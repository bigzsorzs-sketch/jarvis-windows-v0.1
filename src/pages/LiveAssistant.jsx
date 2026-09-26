import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MessageCircle, Mic, MicOff, RotateCcw } from 'lucide-react';
import AssistantAvatar3D from '@/components/avatar/AssistantAvatar3D';
import AvatarModelUploader from '@/components/avatar/AvatarModelUploader';
import LiveConversationPanel from '@/components/avatar/LiveConversationPanel';
import LiveAssistantInput from '@/components/avatar/LiveAssistantInput';
import { getAvatarExpression, getStatusLabel } from '@/components/avatar/useAvatarExpression';
import { useVoiceRuntime } from '@/hooks/useVoiceRuntime';
import { loadFullContext } from '@/lib/assistantTools';
import { routeUserCommand } from '@/lib/CommandRouter';
import normalizeAssistantReply from '@/lib/normalizeAssistantReply';
import { sanitizeAssistantText } from '@/lib/assistantResponseHandler';
import { jarvis } from '@/api/jarvisClient';

const LIVE_ASSISTANT_CONVERSATION_TITLE = 'Live Assistant';
const DEFAULT_LIVE_ASSISTANT_AVATAR_URL = 'https://skfb.ly/oKCn6';

function detectMessageEmotion(message = '') {
  const text = String(message)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/\b(koszonom|szuper|nagyszeru|orulok|boldog|jo hir|imadom|tetszik|haha|vicces)\b/.test(text)) return 'joy';
  if (/\b(aggodom|felek|baj|veszely|problema|ideges|stressz|bizonytalan|segitseg|rossz)\b/.test(text)) return 'worried';
  if (/\b(merges|haragszom|dühos|duhos|utalom|elegem van|bosszant|felhaborito)\b/.test(text)) return 'anger';
  return 'neutral';
}

function getInstantAssistantReply(message) {
  const normalized = String(message || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (/^(szia|hello|helo|hali|jo napot)[!.]?$/i.test(normalized)) {
    return 'Szia, hallak. Miben segítsek?';
  }

  if (/(hallasz|hallod|itt vagy|mukodsz|figyelsz)/i.test(normalized)) {
    return 'Igen, hallak és figyelek.';
  }

  if (normalized.includes('mozog') && (normalized.includes('szad') || normalized.includes('szaj'))) {
    return 'Igen, az avatar animáció aktív, és a szájmozgást is használom.';
  }

  return '';
}

export default function LiveAssistant() {
  const navigate = useNavigate();
  const voice = useVoiceRuntime();
  const [ctx, setCtx] = useState(null);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Szia, itt vagyok. Miben segíthetek ma neked?' }
  ]);
  const [textInput, setTextInput] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_LIVE_ASSISTANT_AVATAR_URL);
  const [busy, setBusy] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const conversationIdRef = useRef(null);
  const historyReadyRef = useRef(false);
  const lastHandledTranscriptRef = useRef('');

  const latestUserEmotion = useMemo(() => {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
    return detectMessageEmotion(lastUserMessage?.content);
  }, [messages]);

  const expression = useMemo(() => {
    if (voice.lastError || permissionError) return 'error';
    if (busy) return latestUserEmotion === 'neutral' ? 'speaking' : latestUserEmotion;
    const runtimeExpression = getAvatarExpression(voice.state, null);
    return runtimeExpression === 'neutral' ? latestUserEmotion : runtimeExpression;
  }, [busy, latestUserEmotion, voice.state, voice.lastError, permissionError]);
  const statusLabel = getStatusLabel(expression);

  const persistMessages = async (nextMessages) => {
    if (!historyReadyRef.current) return;
    const savedMessages = nextMessages.map((message) => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || new Date().toISOString(),
    }));

    if (conversationIdRef.current) {
      await jarvis.entities.Conversation.update(conversationIdRef.current, { messages: savedMessages });
      return;
    }

    const created = await jarvis.entities.Conversation.create({
      title: LIVE_ASSISTANT_CONVERSATION_TITLE,
      messages: savedMessages,
    });
    conversationIdRef.current = created.id;
  };

  useEffect(() => {
    localStorage.setItem('liveAssistantAvatarUrl', DEFAULT_LIVE_ASSISTANT_AVATAR_URL);
    loadFullContext().then(setCtx).catch(() => {});

    jarvis.entities.Conversation
      .filter({ title: LIVE_ASSISTANT_CONVERSATION_TITLE }, '-updated_date', 1)
      .then((conversations) => {
        const latest = conversations?.[0];
        if (latest?.id) conversationIdRef.current = latest.id;
        if (latest?.messages?.length) setMessages(latest.messages.slice(-20));
        historyReadyRef.current = true;
      })
      .catch(() => {
        historyReadyRef.current = true;
      });
  }, []);

  useEffect(() => {
    if (voice.state.handsFree) return;
    voice.setHandsFree(true);
  }, []);

  useEffect(() => {
    if (!voice.lastError) return;
    setPermissionError(voice.lastError.message || 'A mikrofon most nem indult el.');
  }, [voice.lastError]);

  useEffect(() => {
    const transcript = voice.lastTranscript?.trim();
    if (!transcript || busy || transcript === lastHandledTranscriptRef.current) return;
    lastHandledTranscriptRef.current = transcript;
    voice.clearTranscript?.();

    const handleTranscript = async () => {
      await sendToAssistant(transcript, 'voice');
      voice.completeVoiceCycle?.(0, 'live_assistant_reply_done');
    };

    handleTranscript();
  }, [voice.lastTranscript]);

  const sendToAssistant = async (message, source = 'chat') => {
    if (!message || busy) return;
    setBusy(true);
    setPermissionError('');

    const userMessages = [
      ...messages,
      { role: 'user', content: message, timestamp: new Date().toISOString() },
    ].slice(-20);
    setMessages(userMessages);
    void persistMessages(userMessages);

    const instantReply = getInstantAssistantReply(message);
    if (instantReply) {
      const assistantMessages = [
        ...userMessages,
        { role: 'assistant', content: instantReply, timestamp: new Date().toISOString() },
      ].slice(-20);
      setMessages(assistantMessages);
      void persistMessages(assistantMessages);
      setBusy(false);
      void voice.speakText(instantReply, 'hu');
      return;
    }

    try {
      const routed = await routeUserCommand({
        text: message,
        source,
        history: userMessages,
        ctx,
        lang: 'hu',
      });
      const reply = sanitizeAssistantText(normalizeAssistantReply(routed.reply || routed.turn?.reply || 'Rendben.')).slice(0, 420);
      const assistantMessages = [
        ...userMessages,
        { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
      ].slice(-20);
      setMessages(assistantMessages);
      void persistMessages(assistantMessages);
      setBusy(false);
      void voice.speakText(reply, 'hu');
    } catch {
      const fallback = 'Most nem sikerült válaszolnom. Kérlek próbáld újra egy rövidebb üzenettel.';
      const fallbackMessages = [
        ...userMessages,
        { role: 'assistant', content: fallback, timestamp: new Date().toISOString() },
      ].slice(-20);
      setMessages(fallbackMessages);
      void persistMessages(fallbackMessages);
    } finally {
      setBusy(false);
    }
  };

  const handleTextSend = async (event) => {
    event?.preventDefault?.();
    const message = textInput.trim();
    if (!message || busy) return;
    setTextInput('');
    await sendToAssistant(message, 'chat');
  };

  const retryMic = () => {
    setPermissionError('');
    voice.clearError?.();
    voice.setHandsFree(false);
    setTimeout(() => voice.setHandsFree(true), 250);
  };

  const stopAndBack = (path = '/chat') => {
    voice.setHandsFree(false);
    navigate(path);
  };

  return (
    <div className="h-full bg-gradient-to-b from-background via-background to-secondary/30 text-foreground flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 shrink-0">
        <button onClick={() => stopAndBack('/chat')} className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
          <ArrowLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold">Live Assistant</p>
          <p className="text-[11px] text-muted-foreground">Jarvis 3D hands-free mód</p>
        </div>
        <button onClick={() => voice.setHandsFree(!voice.state.handsFree)} className={`w-10 h-10 rounded-full flex items-center justify-center ${voice.state.handsFree ? 'bg-red-500 text-white' : 'bg-primary text-primary-foreground'}`}>
          {voice.state.handsFree ? <MicOff size={17} /> : <Mic size={17} />}
        </button>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden flex flex-col px-4 py-3">
        <div className="relative flex-1 min-h-0 flex flex-col rounded-[2rem] border border-border bg-card/70 shadow-2xl shadow-black/20 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.18),transparent_45%)]" />
          <div className="relative pt-6 space-y-3 px-4">
            <AssistantAvatar3D expression={expression} avatarUrl={avatarUrl} />
            <AvatarModelUploader onModelReady={setAvatarUrl} />
          </div>
          <div className="relative px-5 pb-5 space-y-3 flex-1 min-h-0 flex flex-col">
            <div className="mx-auto w-fit inline-flex items-center gap-2 rounded-full bg-secondary border border-border px-3 py-1.5 text-xs text-muted-foreground">
              {expression === 'thinking' && <Loader2 size={12} className="animate-spin text-primary" />}
              {expression === 'listening' && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
              {expression === 'speaking' && <MessageCircle size={12} className="text-primary" />}
              {statusLabel}
            </div>

            {permissionError && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {permissionError}
                <button onClick={retryMic} className="mt-2 w-full rounded-xl bg-secondary px-3 py-2 text-xs font-semibold text-foreground flex items-center justify-center gap-2">
                  <RotateCcw size={13} /> Mikrofon újrapróbálása
                </button>
              </div>
            )}

            <LiveConversationPanel messages={messages} />
          </div>
        </div>
      </main>

      <footer className="px-4 pb-3 shrink-0 space-y-2 bg-background/95 backdrop-blur border-t border-border z-20">
        <LiveAssistantInput value={textInput} onChange={setTextInput} onSubmit={handleTextSend} busy={busy} />
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => stopAndBack('/chat')} className="rounded-2xl bg-secondary border border-border py-3 text-sm font-semibold">
            Normál chat
          </button>
          <button onClick={() => voice.setHandsFree(false)} className="rounded-2xl bg-red-500/15 border border-red-500/30 py-3 text-sm font-semibold text-red-300">
            Hands-free stop
          </button>
        </div>
      </footer>
    </div>
  );
}