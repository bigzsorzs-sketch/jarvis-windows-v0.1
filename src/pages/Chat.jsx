import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { jarvis } from '@/api/jarvisClient';
import { loadFullContext, TOOLS, executeActions } from '@/lib/assistantTools';
import { getGreeting } from '@/components/chat/chatGreeting';
import { getWindowedMessages, buildFileLabel, getChatErrorMessage } from '@/components/chat/chatUtils';
import { detectLanguage } from '@/lib/languageEngine';
import { routeUserCommand } from '@/lib/CommandRouter';
import { useLang } from '@/lib/i18n';
import { useChatVoiceBridge } from '@/hooks/useChatVoiceBridge';

import { logger } from '@/lib/logger';
import { runWorkflow } from '@/lib/workflowEngine';

import { getActiveRoute, finishNavigationSession, findContactForNavigation, getFrequentDestinationSuggestion, startNavigationSession, handleRouteLifecycle, restoreActiveRouteSession, retryRouteSync, setTrackingMode } from '@/lib/navigationTracker';
import { useRouteTrackingStore } from '@/lib/routeTrackingStore';
import { requestMotionAccessIfNeeded, startDrivingDetection } from '@/lib/drivingDetection';
import { invokeWithRetry } from '@/lib/llmGateway';
import { telemetry } from '@/lib/speechTelemetry';
import normalizeAssistantReply from '@/lib/normalizeAssistantReply';
import { sanitizeAssistantText, summarizeActionResults } from '@/lib/assistantResponseHandler';
import { getApprovalMode } from '@/lib/capabilityRegistry';
import { networkMonitor } from '@/lib/networkMonitor';
import { sessionPersistence } from '@/lib/sessionPersistence';
import {
  deleteConversationHistory,
  getConversationHistory,
  listConversationHistory,
  migrateLegacyChatSnapshotOnce,
  saveConversationHistory,
} from '@/lib/conversationHistory';
import { queueConversationSync, saveChatSnapshot } from '@/lib/indexedDbOfflineStore';
import { createConversationSaveSession, enqueueConversationSave } from '@/lib/chatSessionPersistence';
import { startOfflineAutoSync, syncOfflineData } from '@/lib/offlineSyncManager';
import { selfHealingMonitor } from '@/lib/selfHealingMonitor';
import { handleSelfAuditCommand } from '@/lib/selfAuditCommand';
import { useVoiceRuntime } from '@/hooks/useVoiceRuntime';
import { requestMicrophonePermission } from '@/lib/microphonePermission';
import { useSystemStore } from '@/lib/appStore';
import JarvisVoiceStage from '@/components/command-center/JarvisVoiceStage';
import CommandCenterActions from '@/components/command-center/CommandCenterActions';
import CommandCenterChatPanel from '@/components/command-center/CommandCenterChatPanel';

import SetupWizard from '@/components/setup/SetupWizard';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatInputBar from '@/components/chat/ChatInputBar';
import ChatConfirmBar from '@/components/chat/ChatConfirmBar';
import ChatNavModal from '@/components/chat/ChatNavModal';
import ChatFeedbackModal from '@/components/chat/ChatFeedbackModal';
import ChatHistoryDrawer from '@/components/chat/ChatHistoryDrawer';
import PullToRefresh from '@/components/common/PullToRefresh';
import VirtualizedMessageList from '@/components/chat/VirtualizedMessageList';
import DrivingModeBanner from '@/components/chat/DrivingModeBanner';
import ActiveRouteCard from '@/components/chat/ActiveRouteCard';

const ACTIVE_CHAT_SESSION_KEY = 'jarvis_active_chat_conversation_id';

export default function Chat() {
  const { lang, t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const commandCenterHome = location.pathname === '/';
  const voice = useVoiceRuntime();
  const setSystemState = useSystemStore((state) => state.setSystemState);

  const [showSetup, setShowSetup] = useState(false);
  useEffect(() => {
    if (location.state?.reopenSetup) {
      setShowSetup(true);
      navigate(location.pathname, { replace:true, state:null });
    }
  }, [location.state, location.pathname, navigate]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [ctx, setCtx] = useState(null);
  const [showNavModal, setShowNavModal] = useState(false);
  const [navQuery, setNavQuery] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [detectedLang, setDetectedLang] = useState(lang);
  const [attachedImages, setAttachedImages] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [userMood, setUserMood] = useState('neutral');
  const [isOnline, setIsOnline] = useState(networkMonitor.isOnline());
  const [degradedMode, setDegradedMode] = useState(false);
  const [drivingMode, setDrivingMode] = useState(false);
  const [routeWatch, setRouteWatch] = useState(false);
  const [activeRoute, setActiveRoute] = useState(() => getActiveRoute());
  const routeTracking = useRouteTrackingStore();

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const sendMessageRef = useRef(null);
  const messagesRef = useRef([]);
  const initialMessageRef = useRef('');
  const conversationIdRef = useRef(null);
  const offlineChatIdRef = useRef(crypto.randomUUID());
  const conversationSaveSessionRef = useRef(createConversationSaveSession());

  // ── Derived voice state from central runtime ───────────────────────────────
  const handsFree = voice.state.handsFree;
  const isListening = voice.state.isListening;

  const toggleHandsFree = useCallback(async () => {
    const next = !voice.state.handsFree;
    if (next) {
      const permission = await requestMicrophonePermission();
      if (!permission.ok) {
        setMessages((prev) => [...prev, { role: 'assistant', content: `🎙️ ${permission.message}` }]);
        return;
      }
    }
    voice.setHandsFree(next);
    sessionPersistence.save({ handsFree: next });
  }, [voice]);

  const toggleVoice = useCallback(async () => {
    if (voice.state.activationMode === 'push-to-talk'
      && (voice.state.isListening || voice.state.isRecognitionActive || voice.state.isRecognitionStarting)) {
      voice.cancelVoiceCycle?.('user_cancelled');
      return;
    }

    if (voice.state.activationMode !== 'push-to-talk' && voice.state.handsFree) {
      voice.setHandsFree(false);
      sessionPersistence.save({ handsFree: false });
      return;
    }

    const permission = await requestMicrophonePermission();
    if (!permission.ok) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `🎙️ ${permission.message}` }]);
      return;
    }

    if (voice.state.activationMode === 'push-to-talk') {
      voice.startSingleCycle?.();
      return;
    }

    voice.setHandsFree(true);
    sessionPersistence.save({ handsFree: true });
  }, [voice]);

  // ── Initialise from persisted session ─────────────────────────────────────
  useEffect(() => {
    const saved = sessionPersistence.load();
    if (saved.handsFree && voice.state.activationMode !== 'push-to-talk') voice.setHandsFree(true);
    if (saved.detectedLang) setDetectedLang(saved.detectedLang);
  }, []);

  const refreshConversationHistory = useCallback(async () => {
    const rows = await listConversationHistory(80);
    setConversationHistory(rows);
    return rows;
  }, []);

  const startNewConversation = useCallback(() => {
    conversationSaveSessionRef.current = createConversationSaveSession();
    conversationIdRef.current = null;
    offlineChatIdRef.current = crypto.randomUUID();
    try { sessionStorage.removeItem(ACTIVE_CHAT_SESSION_KEY); } catch {}
    setHistoryOpen(false);
    setPendingConfirm(null);
    setLoading(false);
    setLoadingStep('');
    setInput('');
    setAttachedImages([]);
    setDetectedLang(lang || 'hu');
    setMessages([{ role:'assistant', content:getGreeting(ctx?.settings?.user_name, lang) }]);
  }, [ctx?.settings?.user_name, lang]);

  const openConversationFromHistory = useCallback((conversation) => {
    if (!conversation?.id || !Array.isArray(conversation?.messages)) return;
    conversationSaveSessionRef.current = createConversationSaveSession(conversation.id);
    conversationIdRef.current = conversation.id;
    offlineChatIdRef.current = conversation.id;
    try { sessionStorage.setItem(ACTIVE_CHAT_SESSION_KEY, conversation.id); } catch {}
    setPendingConfirm(null);
    setLoading(false);
    setLoadingStep('');
    setInput('');
    setAttachedImages([]);
    setDetectedLang(conversation?.metadata?.detectedLang || lang || 'hu');
    setMessages(getWindowedMessages(conversation.messages));
    setHistoryOpen(false);
  }, [lang]);

  const deleteConversationFromHistory = useCallback(async (conversationId) => {
    if (!conversationId) return;
    if (!window.confirm('Biztosan törlöd ezt a beszélgetést az előzményekből?')) return;
    await deleteConversationHistory(conversationId);
    if (conversationIdRef.current === conversationId) startNewConversation();
    await refreshConversationHistory();
  }, [refreshConversationHistory, startNewConversation]);

  // ── Boot: always start a clean chat; previous sessions live in History ─────
  useEffect(() => {
    const bootSaveSession = conversationSaveSessionRef.current;
    void migrateLegacyChatSnapshotOnce()
      .catch((error) => logger.warn('Chat', 'Legacy chat history migration failed', { message:error?.message }))
      .finally(() => { void refreshConversationHistory(); });

    loadFullContext().then(async (c) => {
      if (!c?.settings) setShowSetup(true);
      setCtx(c);
      setDetectedLang(lang || 'hu');
      if (conversationSaveSessionRef.current !== bootSaveSession) return;

      let sessionConversationId = '';
      try { sessionConversationId = sessionStorage.getItem(ACTIVE_CHAT_SESSION_KEY) || ''; } catch {}
      if (sessionConversationId) {
        const activeConversation = await getConversationHistory(sessionConversationId);
        if (conversationSaveSessionRef.current !== bootSaveSession) return;
        if (activeConversation?.messages?.length) {
          conversationSaveSessionRef.current = createConversationSaveSession(activeConversation.id);
          conversationIdRef.current = activeConversation.id;
          offlineChatIdRef.current = activeConversation.id;
          setDetectedLang(activeConversation?.metadata?.detectedLang || lang || 'hu');
          setMessages(getWindowedMessages(activeConversation.messages));
          return;
        }
        try { sessionStorage.removeItem(ACTIVE_CHAT_SESSION_KEY); } catch {}
      }

      conversationSaveSessionRef.current = createConversationSaveSession();
      conversationIdRef.current = null;
      setMessages([{ role: 'assistant', content: getGreeting(c?.settings?.user_name, lang) }]);
    }).catch(() => {
      if (conversationSaveSessionRef.current !== bootSaveSession) return;
      setDetectedLang(lang || 'hu');
      conversationSaveSessionRef.current = createConversationSaveSession();
      conversationIdRef.current = null;
      try { sessionStorage.removeItem(ACTIVE_CHAT_SESSION_KEY); } catch {}
      setMessages([{ role: 'assistant', content: getGreeting(undefined, lang || 'hu') }]);
    });
  }, []);

  useEffect(() => {
    if (ctx && messages.length <= 1) {
      setMessages([{ role: 'assistant', content: getGreeting(ctx?.settings?.user_name, lang) }]);
    }
  }, [lang]);

  useEffect(() => {
    messagesRef.current = messages;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (!messages.length) return;

    void saveChatSnapshot(messages, { detectedLang, handsFree: voice.state.handsFree })
      .catch((error) => logger.warn('Chat', 'Local snapshot failed', { message:error?.message }));

    if (messages.some((message) => message?.role === 'user')) {
      const saveSession = conversationSaveSessionRef.current;
      void enqueueConversationSave(
        saveSession,
        messages,
        { detectedLang, handsFree:voice.state.handsFree, offlineChatId:offlineChatIdRef.current },
        saveConversationHistory,
        (savedId, savedSession) => {
          // An old conversation may finish saving after the user switched tabs.
          // Persist it under its own ID without replacing the active chat.
          if (conversationSaveSessionRef.current !== savedSession) return;
          conversationIdRef.current = savedId;
          try { sessionStorage.setItem(ACTIVE_CHAT_SESSION_KEY, savedId); } catch {}
        },
        (error) => {
          logger.warn('Chat', 'Conversation history save failed', { message:error?.message });
        }
      ).then(() => refreshConversationHistory())
        .catch((error) => logger.warn('Chat', 'History refresh failed', { message:error?.message }));
    }
  }, [messages, detectedLang, voice.state.handsFree, refreshConversationHistory]);

  useEffect(() => {
    const stopAutoSync = startOfflineAutoSync();
    return stopAutoSync;
  }, []);

  // ── Network awareness ──────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = networkMonitor.subscribe((online) => {
      setIsOnline(online);
      if (!online) {
        setDegradedMode(true);
        telemetry.recordFallback();
      } else {
        setDegradedMode(false);
        telemetry.clearFallback();
        queueConversationSync(messagesRef.current, {
          detectedLang, handsFree:voice.state.handsFree,
          offlineChatId:offlineChatIdRef.current,
          conversationId:conversationIdRef.current || null
        });
        syncOfflineData();
      }
    });
    return unsub;
  }, []);

  // ── Voice error handling from central runtime ──────────────────────────────
  useEffect(() => {
    if (!voice.lastError) return;
    if (voice.lastError.type === 'microphone_denied') {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Mikrofon hozzáférés megtagadva. Kérlek engedélyezd a böngészőben.' }]);
    }
    if (voice.lastError.type === 'voice_timeout' || voice.lastError.type === 'voice_latency') {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${voice.lastError.message}` }]);
    }
    if (voice.lastError.type === 'tts_failed') {
      setMessages(prev => [...prev, { role: 'assistant', content: 'A hangválasz most nem indult el, de a szöveges válasz elérhető.' }]);
    }
    voice.clearError();
  }, [voice.lastError]);

  useChatVoiceBridge({ voice, setInput, sendMessageRef, setUserMood });

  useEffect(() => {
    const cleanup = handleRouteLifecycle();
    const restored = restoreActiveRouteSession();
    if (restored) {
      setActiveRoute(restored);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Folytatod az út naplózását?' }]);
    }

    requestMotionAccessIfNeeded();
    const stopDrivingDetection = startDrivingDetection({
      onDrivingDetected: async () => {
        if (getActiveRoute() || routeWatch || !document.hasFocus()) return;
        const suggestion = getFrequentDestinationSuggestion();
        if (!suggestion?.contact_name || !suggestion?.destination_address) {
          setDrivingMode(true);
          return;
        }
        try {
          setDrivingMode(true);
          setRouteWatch(true);
          await startNavigationSession({ name: suggestion.contact_name }, suggestion.destination_address, { trackingMode: routeTracking.trackingMode });
          setActiveRoute(getActiveRoute());
          setMessages((prev) => [...prev, { role: 'assistant', content: `🚗 Automatikus vezetési mód aktiválva: ${suggestion.contact_name}` }]);
        } catch {
          setDrivingMode(true);
        }
      }
    });

    return () => {
      cleanup();
      stopDrivingDetection?.();
    };
  }, [routeWatch, routeTracking.trackingMode]);

  // ── TTS: use central voice runtime speakText ───────────────────────────────
  const speakReply = useCallback(async (text, lang) => {
    const spoken = await voice.speakText(text, lang);
    if (!spoken) {
      logger.warn('Chat', 'TTS did not complete', { lang });
    }
    return spoken;
  }, [voice]);

  // Real-time, non-blocking memory extractor with deduplication
  const extractAndSaveMemory = useCallback(async (msg, existingMemories) => {
    try {
      const safeMsg = msg.substring(0, 300).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const mc = await invokeWithRetry({
        prompt: `Does this user message contain a personal fact worth remembering? Message: "${safeMsg}"
Return JSON: {"save": boolean, "content": "string (the fact)", "category": "preference|fact|habit|interest|other"}
Only save if genuinely new personal info (name, health fact, preference, habit). Return save:false for questions or generic statements.`,
        request_origin: 'conversation',
        response_json_schema: {
          type: 'object',
          properties: {
            save: { type: 'boolean' },
            content: { type: 'string' },
            category: { type: 'string' }
          }
        }
      });
      const envelope = mc?.data?.result ?? mc?.data ?? mc;
      const parsed = typeof envelope === 'string' ? JSON.parse(envelope) : envelope;
      if (parsed?.save !== true || typeof parsed.content !== 'string' || parsed.content.length < 5) return;
      // Deduplication: skip if similar memory already exists
      const isDuplicate = existingMemories.some(m =>
        m.content?.toLowerCase().includes(parsed.content.toLowerCase().slice(0, 20))
      );
      if (isDuplicate) return;
      await TOOLS.save_memory({ content: parsed.content, category: parsed.category || 'fact', importance: 6 });
    } catch {
      // Non-blocking — never surface to user
    }
  }, []);

  const handleVoiceCall = async (contactName) => {
    if ('contacts' in navigator && 'ContactsManager' in window) {
      try {
        const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: true });
        const match = contacts?.find(c => c.name?.some(n => n.toLowerCase().includes(contactName.toLowerCase())));
        if (match?.tel?.length > 0) {
          setMessages(prev => [...prev, { role: 'assistant', content: `📞 Hívom: ${match.name?.[0] || contactName} – ${match.tel[0]}` }]);
          window.location.href = `tel:${match.tel[0].replace(/\s/g, '')}`;
          return;
        }
      } catch {}
    }
    const found = ctx?.contacts?.find(c => c.name?.toLowerCase().includes(contactName.toLowerCase()));
    if (found?.phone) {
      setMessages(prev => [...prev, { role: 'assistant', content: `📞 Hívom: ${found.name} – ${found.phone}` }]);
      window.location.href = `tel:${found.phone.replace(/\s/g, '')}`;
    } else {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Nem találtam "${contactName}" nevű kontaktot.` }]);
    }
  };

  const sendMessage = useCallback(async (overrideText) => {
    const resolvedInput = typeof overrideText === 'string'
      ? overrideText
      : typeof input === 'string'
        ? input
        : '';
    const msg = resolvedInput.trim();
    if (loading) return;
    // The generation is a concrete session object; once the user switches
    // conversations, asynchronous AI results must not mutate the next chat.
    const sendingSession = conversationSaveSessionRef.current;
    const isCurrentSession = () => conversationSaveSessionRef.current === sendingSession;

    const selfAudit = await handleSelfAuditCommand({
      input: resolvedInput,
      source: typeof overrideText === 'string' ? 'voice' : 'chat',
      getCurrentUser: () => jarvis.auth.me().catch(() => null),
    });
    if (!isCurrentSession()) return;
    if (selfAudit?.handled) {
      setInput('');
      setAttachedImages([]);
      setMessages(prev => getWindowedMessages([...prev, { role: 'assistant', content: sanitizeAssistantText(selfAudit.reply) }]));
      return;
    }

    if ((!msg && attachedImages.length === 0)) return;
    if (msg.length > 2000) {
      setMessages(prev => [...prev, { role: 'assistant', content: t('msg_too_long') }]);
      return;
    }
    const currentFiles = [...attachedImages];
    const fileLabel = buildFileLabel(currentFiles);
    const userMsg = { role: 'user', content: msg || fileLabel || '📎 Fájl csatolva', attachedFiles: currentFiles };
    setMessages(prev => getWindowedMessages([...prev, userMsg]));
    if (import.meta.env?.DEV) console.info('USER_MESSAGE_RENDERED_IMMEDIATELY', { source: typeof overrideText === 'string' ? 'voice' : 'typed' });
    setInput('');
    setAttachedImages([]);

    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (!isCurrentSession()) return;

    if (networkMonitor.isOffline()) {
      const offlineReply = { role: 'assistant', content: 'Jelenleg nincs internetkapcsolat. Az üzenetet helyben tárolom, de az AI nem válaszol automatikusan, amikor visszajön a kapcsolat. Ha választ szeretnél, küldd el újra az üzenetet online állapotban.' };
      const offlineMessages = getWindowedMessages([...messages, userMsg, offlineReply]);
      setMessages(offlineMessages);
      queueConversationSync(offlineMessages, {
        detectedLang, handsFree:voice.state.handsFree, offline:true,
        offlineChatId:offlineChatIdRef.current,
        conversationId:conversationIdRef.current || null
      });
      return;
    }

    setLoading(true);

    try {
      setLoadingStep(t('thinking'));
      const detectedFromMessage = msg.length > 8 ? await detectLanguage(msg, lang || detectedLang || 'hu', { requestOrigin:'conversation' }) : (detectedLang || lang || 'hu');
      if (!isCurrentSession()) return;
      const routed = await routeUserCommand({
        text: msg,
        source: typeof overrideText === 'string' ? 'voice' : 'chat',
        history: [...messages, userMsg],
        ctx,
        lang: detectedFromMessage,
        userMood,
        attachedFiles: currentFiles,
        handlers: { onCallContact: async (...args) => {
          if (!isCurrentSession()) return;
          return handleVoiceCall(...args);
        } },
      });
      if (!isCurrentSession()) return;

      if (routed.uiAction === 'enable_driving_mode') {
        setDrivingMode(true);
        setMessages(prev => [...prev, { role: 'assistant', content: routed.reply }]);
        setLoading(false);
        setLoadingStep('');
        return;
      }

      if (routed.uiAction === 'enable_route_watch') {
        setDrivingMode(true);
        setRouteWatch(true);
        setMessages(prev => [...prev, { role: 'assistant', content: routed.reply }]);
        setLoading(false);
        setLoadingStep('');
        return;
      }

      if (routed.uiAction === 'open_navigation_modal') {
        setDrivingMode(true);
        setShowNavModal(true);
        setLoading(false);
        setLoadingStep('');
        return;
      }

      if (routed.confirmation) {
        setPendingConfirm(routed.confirmation);
        setMessages(prev => [...prev, { role: 'assistant', content: routed.reply }]);
        setLoading(false);
        setLoadingStep('');
        return;
      }

      if (routed.intent !== 'assistant_turn') {
        const assistantText = normalizeAssistantReply(routed.reply);
        if (assistantText) {
          setMessages(prev => getWindowedMessages([...prev, { role: 'assistant', content: assistantText, actionResults: routed.actionResults || [] }]));
          if (voice.state.autoSpeakReplies || handsFree || ctx?.settings?.tts_enabled) {
            await speakReply(assistantText, detectedFromMessage || detectedLang || lang || 'hu');
          }
        }
        return;
      }

      const turn = routed.turn;
      telemetry.recordLatency(turn.latencyMs);
      setSystemState({ llmLatencyMs: turn.latencyMs });
      setDetectedLang(turn.detectedLang);
      sessionPersistence.save({ handsFree: voice.state.handsFree, detectedLang: turn.detectedLang });

      const reply = sanitizeAssistantText(normalizeAssistantReply(routed.reply));
      const actions = routed.actions || [];
      let actionResults = routed.actionResults || [];
      let finalReply = reply;

      if (actions.length > 0) {
        const uiConfirmTools = new Set(['create_invoice', 'draft_email', 'call_contact', 'generate_pdf']);
        const requiresConfirmation = actions.some((action) =>
          uiConfirmTools.has(action.tool) || getApprovalMode(action.tool) === 'confirm'
        );

        if (requiresConfirmation) {
          setLoading(false);
          setLoadingStep('');
          const cleanReply = reply.replace(/\[ACTION:[^\]]+\]/g, '').trim();
          setPendingConfirm({
            actions,
            reply: cleanReply,
            lang: detectedFromMessage,
            goal: msg,
            preapprovedTools: actions
              .filter((action) => getApprovalMode(action.tool) === 'confirm')
              .map((action) => action.tool),
          });
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `${cleanReply}\n\n⚠️ ${String(detectedFromMessage).startsWith('hu') ? 'Megerősítésed szükséges a folytatáshoz.' : 'Confirmation is required to continue.'}`
          }]);
          return;
        }

        actionResults = await executeActions(actions, {
          source:'assistant',
          goal:msg,
        });
        if (!isCurrentSession()) return;
        finalReply = summarizeActionResults(actionResults, detectedFromMessage);
        const refreshed = await loadFullContext(true).catch(() => turn.nextCtx || ctx);
        if (!isCurrentSession()) return;
        if (refreshed) setCtx(refreshed);
      } else {
        // Real-time memory extraction — async, non-blocking, runs on every message
        if (msg.length > 8 && ctx && ctx.settings?.learning_memory !== false && !msg.startsWith('?') && !msg.startsWith('/')) {
          extractAndSaveMemory(msg, ctx.memories || []);
        }
      }

      setMessages(prev => getWindowedMessages([...prev, { role: 'assistant', content: finalReply, actionResults }]));

      const cleanReply = normalizeAssistantReply(reply).replace(/\[ACTION:[^\]]+\]/g, '').replace(/[*_#`]/g, '').trim();
      if (voice.state.autoSpeakReplies || handsFree || ctx?.settings?.tts_enabled) {
        await speakReply(cleanReply, turn.detectedLang);
      }

    } catch (err) {
      if (!isCurrentSession()) return;
      console.error('Chat send error:', err);
      logger.error('Chat', 'sendMessage failed', {
        message:String(err?.message || err || ''),
        code:err?.code || null,
      });

      if (err?.message === 'llm_timeout' || /timeout/i.test(String(err?.message || ''))) {
        telemetry.recordFallback();
        selfHealingMonitor.recordWorkerError();
        setDegradedMode(true);
      }

      const fallback = !networkMonitor.isOnline()
        ? 'Most offline vagy. Az üzenetet később újra megpróbálhatod.'
        : `${t('error_occurred')}. ${t('try_again')}`;
      const userMessage = getChatErrorMessage(err, fallback);
      setMessages(prev => getWindowedMessages([...prev, { role:'assistant', content:userMessage }]));
    } finally {
      if (isCurrentSession()) {
        setLoading(false);
        setLoadingStep('');
      }
    }
  }, [input, loading, messages, ctx, attachedImages, lang, t, detectedLang, userMood, handsFree, speakReply, voice.state.handsFree]);

  // Keep ref always pointing to latest sendMessage
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  // Consume route state exactly once. This keeps legacy/deep-link callers from
  // losing an initial prompt when they navigate into the unified chat.
  useEffect(() => {
    const initial = typeof location.state?.initialMessage === 'string'
      ? location.state.initialMessage.trim()
      : '';
    if (!initial || initialMessageRef.current === initial || !sendMessageRef.current || loading) return;
    initialMessageRef.current = initial;
    navigate(location.pathname, { replace:true, state:null });
    void sendMessageRef.current(initial);
  }, [location.state, location.pathname, navigate, loading]);

  const confirmAndExecute = async () => {
    if (!pendingConfirm) return;
    const confirmingSession = conversationSaveSessionRef.current;
    const isCurrentConfirmation = () => conversationSaveSessionRef.current === confirmingSession;
    const confirmation = pendingConfirm;
    setLoading(true);
    setLoadingStep('Végrehajtom...');

    try {
      let results = [];
      if (confirmation.workflowType) {
        results = await runWorkflow(confirmation.workflowType, confirmation.payload);
      } else {
        results = await executeActions(confirmation.actions, {
          source:'assistant-confirmed',
          goal:confirmation.goal || '',
          preapprovedTools:confirmation.preapprovedTools || [],
        });
      }
      if (!isCurrentConfirmation()) return;

      const resultLang = confirmation.lang || detectedLang || lang;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✅ ${summarizeActionResults(results, resultLang)}`,
        actionResults: results
      }]);
      setPendingConfirm(null);
      const refreshed = await loadFullContext(true).catch(() => null);
      if (isCurrentConfirmation() && refreshed) setCtx(refreshed);
    } catch (error) {
      if (!isCurrentConfirmation()) return;
      setMessages(prev => [...prev, {
        role:'assistant',
        content:String((confirmation.lang || detectedLang || lang)).startsWith('hu')
          ? `❌ A művelet nem sikerült: ${error?.message || error}`
          : `❌ Action failed: ${error?.message || error}`
      }]);
    } finally {
      if (isCurrentConfirmation()) {
        setLoading(false);
        setLoadingStep('');
      }
    }
  };

  const exportChatToPDF = () => {
    const chatText = messages.map(m => `${m.role === 'user' ? '👤 You' : '🤖 AI'}:\n${m.content}\n`).join('\n---\n\n');
    const blob = new Blob([chatText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
  };

  const sendFeedback = async () => {
    if (!feedbackText.trim()) return;
    try {
      await jarvis.functions.invoke('sendFeedback', {
        feedbackText: feedbackText.trim().slice(0, 4000)
      });
      setFeedbackText('');
      setShowFeedback(false);
      setMessages(prev => [...prev, { role: 'assistant', content: t('feedback_ok') }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: t('feedback_err') }]);
    }
  };

  const rateAssistantMessage = async ({ rating, assistantReply, userMessage }) => {
    await jarvis.entities.AiResponseFeedback.create({
      rating,
      assistant_reply: assistantReply.slice(0, 4000),
      user_message: String(userMessage || '').slice(0, 2000),
      source: 'chat',
      status: 'new',
    });
  };

  const openGoogleMaps = async () => {
    const query = (navQuery || '').trim();
    if (!query) return;

    const contact = await findContactForNavigation(query).catch(() => null);
    if (contact?.address) {
      const started = await startNavigationSession(contact, contact.address, { trackingMode: routeTracking.trackingMode });
      setActiveRoute(getActiveRoute());
      setMessages((prev) => [...prev, { role: 'assistant', content: `🚗 ${contact.name} (${started.eta_min} min)` }]);
    } else {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving`, '_blank');
      setMessages((prev) => [...prev, { role: 'assistant', content: `🗺️ ${query}` }]);
    }

    setDrivingMode(true);
    setShowNavModal(false);
    setNavQuery('');
  };

  const toggleRouteWatch = () => {
    setRouteWatch((prev) => !prev);
    setMessages((prev) => [...prev, {
      role: 'assistant',
      content: !routeWatch ? t('driving_route_watch_enabled') : t('driving_route_watch_disabled')
    }]);
  };

  const handleFinishTrip = async () => {
    const finished = await finishNavigationSession();
    setActiveRoute(null);
    setRouteWatch(false);
    setMessages((prev) => [...prev, {
      role: 'assistant',
      content: `✅ ${finished.summary}`
    }]);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {showSetup && (
        <SetupWizard onComplete={(newSettings) => {
          setShowSetup(false);
          setCtx(prev => ({ ...prev, settings: newSettings }));
          conversationSaveSessionRef.current = createConversationSaveSession();
          conversationIdRef.current = null;
          offlineChatIdRef.current = crypto.randomUUID();
          try { sessionStorage.removeItem(ACTIVE_CHAT_SESSION_KEY); } catch {}
          setDetectedLang(lang || 'hu');
          setMessages([{ role: 'assistant', content: getGreeting(newSettings.user_name, lang) }]);
        }} />
      )}

      <DrivingModeBanner
        drivingMode={drivingMode}
        routeWatch={routeWatch}
        onOpenNav={() => {
          setNavQuery('');
          setShowNavModal(true);
        }}
        onToggleRouteWatch={toggleRouteWatch}
        trackingMode={routeTracking.trackingMode}
        queueStats={routeTracking.queueStats}
        syncStatus={routeTracking.syncStatus}
        gpsStatus={routeTracking.gpsStatus}
        onRetrySync={retryRouteSync}
        onSelectTrackingMode={setTrackingMode}
      />

      <ActiveRouteCard activeRoute={activeRoute} onFinishTrip={handleFinishTrip} />

      {commandCenterHome && (
        <div className="jarvis-command-center-hero">
          <JarvisVoiceStage
            voice={voice}
            busy={loading}
            busyLabel={loadingStep}
            actions={<CommandCenterActions onNavigate={navigate} />}
            conversation={(
              <>
                <CommandCenterChatPanel
                  messages={messages}
                  input={input}
                  setInput={setInput}
                  onSend={sendMessage}
                  onHistory={() => setHistoryOpen(true)}
                  loading={loading}
                  loadingStep={loadingStep}
                  attachedFiles={attachedImages}
                  setAttachedFiles={setAttachedImages}
                  onMediaError={(errMsg) => setMessages(prev => [...prev, { role: 'assistant', content: errMsg }])}
                />
                <ChatConfirmBar
                  pendingConfirm={pendingConfirm}
                  onConfirm={confirmAndExecute}
                  onCancel={() => setPendingConfirm(null)}
                  t={t}
                />
              </>
            )}
          />
        </div>
      )}

      {!commandCenterHome && <ChatHeader
        aiName={ctx?.settings?.ai_name}
        onNewChat={startNewConversation}
        onHistory={() => setHistoryOpen(true)}
        onExport={exportChatToPDF}
        onFeedback={() => setShowFeedback(true)}
        handsFree={handsFree}
        onToggleHandsFree={toggleHandsFree}
        autoSpeakReplies={voice.state.autoSpeakReplies}
        onToggleAutoSpeak={() => voice.toggleAutoSpeakReplies?.()}
        speechStats={handsFree ? telemetry.getSnapshot() : null}
        isOnline={isOnline}
        degradedMode={degradedMode}
        t={t}
      />}

      {!commandCenterHome && <PullToRefresh onRefresh={async () => {
        const c = await loadFullContext(true);
        setCtx(c);
      }}>
        <VirtualizedMessageList
          messages={getWindowedMessages(messages)}
          loading={loading}
          loadingStep={loadingStep}
          maxVisible={50}
          onRateMessage={rateAssistantMessage}
        />
        <div ref={bottomRef} />
      </PullToRefresh>}

      {!commandCenterHome && <ChatConfirmBar
        pendingConfirm={pendingConfirm}
        onConfirm={confirmAndExecute}
        onCancel={() => setPendingConfirm(null)}
        t={t}
      />}

      {!commandCenterHome && <ChatInputBar
        input={input}
        setInput={setInput}
        onSend={sendMessage}
        onToggleVoice={toggleVoice}
        onNavClick={() => setShowNavModal(true)}
        isListening={isListening}
        voicePhase={voice.state.phase}
        loading={loading}
        attachedFiles={attachedImages}
        setAttachedFiles={setAttachedImages}
        onMediaError={(errMsg) => setMessages(prev => [...prev, { role: 'assistant', content: errMsg }])}
        inputRef={inputRef}
        handsFree={handsFree}
        t={t}
      />}

      <ChatNavModal
        show={showNavModal}
        onClose={() => setShowNavModal(false)}
        navQuery={navQuery}
        setNavQuery={setNavQuery}
        onNavigate={openGoogleMaps}
        t={t}
      />

      <ChatFeedbackModal
        show={showFeedback}
        onClose={() => setShowFeedback(false)}
        feedbackText={feedbackText}
        setFeedbackText={setFeedbackText}
        onSend={sendFeedback}
      />

      <ChatHistoryDrawer
        open={historyOpen}
        conversations={conversationHistory}
        activeConversationId={conversationIdRef.current}
        onClose={() => setHistoryOpen(false)}
        onNewChat={startNewConversation}
        onOpenConversation={openConversationFromHistory}
        onDeleteConversation={deleteConversationFromHistory}
      />
    </div>
  );
}