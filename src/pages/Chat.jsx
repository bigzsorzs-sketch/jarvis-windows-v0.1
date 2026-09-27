import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { jarvis } from '@/api/jarvisClient';
import { loadFullContext, TOOLS, executeActions } from '@/lib/assistantTools';
import { getGreeting } from '@/components/chat/chatGreeting';
import { getWindowedMessages, buildFileLabel } from '@/components/chat/chatUtils';
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
import { sanitizeAssistantText } from '@/lib/assistantResponseHandler';
import { networkMonitor } from '@/lib/networkMonitor';
import { sessionPersistence } from '@/lib/sessionPersistence';
import { loadChatSnapshot, queueConversationSync, saveChatSnapshot } from '@/lib/indexedDbOfflineStore';
import { startOfflineAutoSync, syncOfflineData } from '@/lib/offlineSyncManager';
import { selfHealingMonitor } from '@/lib/selfHealingMonitor';
import { handleSelfAuditCommand } from '@/lib/selfAuditCommand';
import { useVoiceRuntime } from '@/hooks/useVoiceRuntime';
import { useSystemStore } from '@/lib/appStore';

import SetupWizard from '@/components/setup/SetupWizard';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatInputBar from '@/components/chat/ChatInputBar';
import ChatConfirmBar from '@/components/chat/ChatConfirmBar';
import ChatNavModal from '@/components/chat/ChatNavModal';
import ChatFeedbackModal from '@/components/chat/ChatFeedbackModal';
import PullToRefresh from '@/components/common/PullToRefresh';
import VirtualizedMessageList from '@/components/chat/VirtualizedMessageList';
import DrivingModeBanner from '@/components/chat/DrivingModeBanner';
import ActiveRouteCard from '@/components/chat/ActiveRouteCard';

export default function Chat() {
  const { lang, t } = useLang();
  const navigate = useNavigate();
  const voice = useVoiceRuntime();
  const setSystemState = useSystemStore((state) => state.setSystemState);

  const [showSetup, setShowSetup] = useState(false);
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

  // ── Derived voice state from central runtime ───────────────────────────────
  const handsFree = voice.state.handsFree;
  const isListening = voice.state.isListening;

  const toggleHandsFree = useCallback(() => {
    const next = !voice.state.handsFree;
    voice.setHandsFree(next);
    sessionPersistence.save({ handsFree: next });
    if (next) navigate('/live-assistant');
  }, [navigate, voice]);

  const toggleVoice = useCallback(() => {
    if (voice.state.handsFree) {
      voice.setHandsFree(false);
      return;
    }
    voice.startSingleCycle?.();
  }, [voice]);

  // ── Initialise from persisted session ─────────────────────────────────────
  useEffect(() => {
    const saved = sessionPersistence.load();
    if (saved.handsFree) voice.setHandsFree(true);
    if (saved.detectedLang) setDetectedLang(saved.detectedLang);
  }, []);

  // ── Boot: load context and greeting ───────────────────────────────────────
  useEffect(() => {
    loadChatSnapshot().then((snapshot) => {
      if (snapshot?.messages?.length) setMessages(getWindowedMessages(snapshot.messages));
    });

    loadFullContext().then(c => {
      if (!c?.settings) setShowSetup(true);
      setCtx(c);
      setDetectedLang(lang || 'hu');
      setMessages(prev => prev.length ? prev : [{ role: 'assistant', content: getGreeting(c?.settings?.user_name, lang) }]);
    }).catch(() => {
      setDetectedLang(lang || 'hu');
      setMessages(prev => prev.length ? prev : [{ role: 'assistant', content: getGreeting(undefined, lang || 'hu') }]);
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
    if (messages.length) saveChatSnapshot(messages, { detectedLang, handsFree: voice.state.handsFree });
  }, [messages, loading, detectedLang, voice.state.handsFree]);

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
        queueConversationSync(messagesRef.current, { detectedLang, handsFree: voice.state.handsFree });
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
        response_json_schema: {
          type: 'object',
          properties: {
            save: { type: 'boolean' },
            content: { type: 'string' },
            category: { type: 'string' }
          }
        }
      });
      const parsed = typeof mc === 'string' ? JSON.parse(mc) : (mc?.data ?? mc);
      if (!parsed?.save || !parsed?.content || parsed.content.length < 5) return;
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

    const selfAudit = await handleSelfAuditCommand({
      input: resolvedInput,
      source: typeof overrideText === 'string' ? 'voice' : 'chat',
      getCurrentUser: () => jarvis.auth.me().catch(() => null),
    });
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

    if (networkMonitor.isOffline()) {
      const offlineReply = { role: 'assistant', content: 'Offline módban elmentettem az üzenetet a telefonodon. Amint visszajön a kapcsolat, automatikusan szinkronizálom.' };
      const offlineMessages = getWindowedMessages([...messages, userMsg, offlineReply]);
      setMessages(offlineMessages);
      queueConversationSync(offlineMessages, { detectedLang, handsFree: voice.state.handsFree, offline: true });
      return;
    }

    setLoading(true);

    try {
      setLoadingStep(t('thinking'));
      const detectedFromMessage = msg.length > 8 ? await detectLanguage(msg, lang || detectedLang || 'hu') : (detectedLang || lang || 'hu');
      const routed = await routeUserCommand({
        text: msg,
        source: typeof overrideText === 'string' ? 'voice' : 'chat',
        history: [...messages, userMsg],
        ctx,
        lang: detectedFromMessage,
        userMood,
        attachedFiles: currentFiles,
        handlers: { onCallContact: handleVoiceCall },
      });

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

      if (actions.length > 0) {
        const sensitiveActions = ['create_invoice', 'draft_email', 'call_contact', 'generate_pdf'];
        if (actions.some(a => sensitiveActions.includes(a.tool))) {
          setLoading(false);
          setLoadingStep('');
          setPendingConfirm({ actions, reply: reply.replace(/\[ACTION:[^\]]+\]/g, '').trim() });
          setMessages(prev => [...prev, { role: 'assistant', content: reply.replace(/\[ACTION:[^\]]+\]/g, '').trim() + '\n\n⚠️ Megerősítésed szükséges a folytatáshoz.' }]);
          return;
        }
        setTimeout(async () => {
          try {
            setCtx(turn.nextCtx);
          } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Az adatok frissítése sikertelen. Kérlek frissítsd az oldalt.' }]);
          }
        }, 1500);
      } else {
        // Real-time memory extraction — async, non-blocking, runs on every message
        if (msg.length > 8 && ctx && !msg.startsWith('?') && !msg.startsWith('/')) {
          extractAndSaveMemory(msg, ctx.memories || []);
        }
      }

      setMessages(prev => getWindowedMessages([...prev, { role: 'assistant', content: reply, actionResults }]));

      const cleanReply = normalizeAssistantReply(reply).replace(/\[ACTION:[^\]]+\]/g, '').replace(/[*_#`]/g, '').trim().substring(0, 420);
      if (voice.state.autoSpeakReplies || handsFree || ctx?.settings?.tts_enabled) {
        await speakReply(cleanReply, turn.detectedLang);
      }

    } catch (err) {
      console.error('Chat send error:', err);
      if (err?.message === 'llm_timeout' || err?.message?.includes('timeout')) {
        telemetry.recordFallback();
        selfHealingMonitor.recordWorkerError();
        setDegradedMode(true);
        setMessages(prev => getWindowedMessages([...prev, { role: 'assistant', content: '⏱️ Az AI válasz késett — próbáld újra, vagy egyszerűsítsd a kérést.' }]));
      logger.warn('Chat', 'LLM timeout during sendMessage');
      } else if (!networkMonitor.isOnline()) {
        setMessages(prev => getWindowedMessages([...prev, { role: 'assistant', content: 'Most offline vagy. Az üzenetet később újra megpróbálhatod.' }]));
      } else {
        const errorMessage = String(err?.message || '');
        let userMsg = `${t('error_occurred')}. ${t('try_again')}`;
        if (errorMessage.includes('OPENROUTER_API_KEY_REQUIRED')) {
          userMsg = '⚠️ Az AI funkciókhoz még nincs OpenRouter API-kulcs beállítva. A helyi Jarvis-funkciók ettől továbbra is működnek.';
        } else if (errorMessage.includes('401') || errorMessage.includes('OPENROUTER_401')) {
          userMsg = '⚠️ Az OpenRouter API-kulcsot a szolgáltató elutasította. Ellenőrizd a Beállításokban.';
        } else if (errorMessage.includes('429')) {
          userMsg = '⚠️ Rendszer túlterhelt. Próbáld újra pár másodperc múlva.';
        }
        setMessages(prev => getWindowedMessages([...prev, { role: 'assistant', content: userMsg }]));
      }
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }, [input, loading, messages, ctx, attachedImages, lang, t, detectedLang, userMood, handsFree, speakReply, voice.state.handsFree]);

  // Keep ref always pointing to latest sendMessage
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  const confirmAndExecute = async () => {
    if (!pendingConfirm) return;
    setLoading(true);
    setLoadingStep('Végrehajtom...');

    let results = [];
    if (pendingConfirm.workflowType) {
      results = await runWorkflow(pendingConfirm.workflowType, pendingConfirm.payload);
    } else {
      results = await executeActions(pendingConfirm.actions);
    }

    setMessages(prev => [...prev, { role: 'assistant', content: '✅ Végrehajtva!', actionResults: results }]);
    setPendingConfirm(null);
    setTimeout(() => {
      loadFullContext(true).then(c => { setCtx(c); }).catch(() => {});
    }, 1500);
    setLoading(false);
    setLoadingStep('');
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

      <ChatHeader
        aiName={ctx?.settings?.ai_name}
        onNewChat={() => {
          setDetectedLang(lang || 'hu');
          setMessages([{ role: 'assistant', content: getGreeting(ctx?.settings?.user_name, lang) }]);
        }}
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
      />

      <PullToRefresh onRefresh={async () => {
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
      </PullToRefresh>

      <ChatConfirmBar
        pendingConfirm={pendingConfirm}
        onConfirm={confirmAndExecute}
        onCancel={() => setPendingConfirm(null)}
        t={t}
      />

      <ChatInputBar
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
      />

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
    </div>
  );
}