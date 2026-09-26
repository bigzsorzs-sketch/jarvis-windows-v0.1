import { useState, useRef, useEffect, useCallback } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { invokeWithRetry } from '@/lib/llmGateway';
import { getVoiceRuntime } from '@/lib/voiceRuntime';
import { executeGlobalVoiceCommand } from '@/lib/globalVoiceActions';
import normalizeAssistantReply from '@/lib/normalizeAssistantReply';

const AUTOMOTIVE_SYSTEM_PROMPT = `Te egy szakértő autó diagnosztikai asszisztens vagy. Gépkocsik javításában és diagnosztikájában segítesz.

SZEMÉLYISÉG:
- Gondolkozz és válaszolj egy valódi szerviz technicianként
- Strukturált és praktikus tanácsokat adj
- Mindig egyértelműen kérdezz, ha nincs elég információ

VÁLASZSTRUKTÚRA:
1. **Diagnózis**: Mi az a probléma
2. **Legvalószínűbb okok** (Top 3)
3. **Ellenőrzési lépések**: Mit tudhat az autótulajdonos megtenni
4. **Javítási költség**: Alacsony (£0-200) / Közepes (£200-800) / Magas (£800+)
5. **Kockázati szint**: 
   - ✅ Biztonságos: Normal vezetésre
   - ⚠️ Óvatoson: Kerüld a hosszú utakat
   - 🛑 AZONNALI: Azonnal álljon meg az autó

BIZTONSÁG SZABÁLYOK:
- Ha veszélyes, KÖZVETLENÜL figyelmeztess
- Soha ne ajánlj nem biztonságos lépéseket
- Kritikus problémáknál ERŐS figyelmeztetéseket adj

KOMMUNIKÁCIÓ:
- Magyar, világos, praktikus
- Max 3-4 mondat / szekció
- Emojik a szinthez (✅⚠️🛑)`;

const INITIAL_MESSAGE = { role: 'assistant', content: '🔧 **Autó Diagnosztika**\n\n💬 Írj a problémáról\n📡 Csatlakozz OBD2-hez\n🎙️ Vagy mondj valamit' };

export function useAutomotiveChat() {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [attachedImage, setAttachedImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [lastDiagnosis, setLastDiagnosis] = useState(null);
  const [lastParts, setLastParts] = useState([]);

  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);
  const sendMessageRef = useRef(null);
  const voiceUnsubRef = useRef(null);

  const speakVoiceReply = useCallback(async (text) => {
    const runtime = getVoiceRuntime();
    if (!runtime?.getState?.().autoSpeakReplies) return;
    const speechText = String(text || '')
      .replace(/\*\*/g, '')
      .replace(/[#>_`]/g, '')
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    if (speechText) await runtime.speakText(speechText, 'hu');
  }, [speakVoiceReply]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Subscribe to central voice runtime for transcripts
  useEffect(() => {
    const runtime = getVoiceRuntime();
    voiceUnsubRef.current = runtime.subscribe('transcript', async (transcript) => {
      setInput(transcript);
      setIsListening(false);

      const globalResult = await executeGlobalVoiceCommand(transcript);
      if (globalResult?.handled) {
        setMessages(prev => [...prev,
          { role: 'user', content: transcript },
          { role: 'assistant', content: globalResult.reply, actionResults: globalResult.actionResults || [] }
        ]);
        await speakVoiceReply(globalResult.reply);
        return;
      }

      setTimeout(() => sendMessageRef.current?.(transcript, { fromVoice: true }), 300);
    });
    const unsubState = runtime.subscribe('stateChange', (changes) => {
      if ('isListening' in changes) setIsListening(changes.isListening);
    });
    return () => {
      voiceUnsubRef.current?.();
      unsubState?.();
    };
  }, []);

  const addMessage = useCallback((content) => {
    setMessages(prev => [...prev, { role: 'assistant', content }]);
  }, []);

  const resetChat = useCallback(() => {
    setMessages([INITIAL_MESSAGE]);
    setLastDiagnosis(null);
    setLastParts([]);
  }, []);

  const toggleVoice = useCallback(() => {
    const runtime = getVoiceRuntime();
    if (isListening) {
      runtime.setHandsFree(false);
      setIsListening(false);
    } else {
      setInput('');
      runtime.setHandsFree(true);
      setIsListening(true);
    }
  }, [isListening]);

  const handleImageAttach = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const { file_url } = await jarvis.integrations.Core.UploadFile({ file });
      if (file_url) setAttachedImage({ url: file_url, name: file.name });
    } catch (error) {
      console.error('[AutomotiveImageUpload]', error?.message);
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ A kép feltöltése nem sikerült. Próbáld újra egy kisebb képpel.' }]);
    } finally {
      if (e.target) e.target.value = '';
      setUploadingImage(false);
    }
  }, []);

  const sendMessage = useCallback(async (overrideText, options = {}) => {
    const msg = (overrideText || input).trim();
    if ((!msg && !attachedImage) || loading) return;

    setInput('');
    const currentImage = attachedImage;
    const userMsg = { role: 'user', content: msg || '📎 Kép', imageUrl: currentImage?.url };
    setMessages(prev => [...prev, userMsg]);
    setAttachedImage(null);
    setLoading(true);

    try {
      const history = [...messages.slice(-6), userMsg]
        .map(m => `${m.role === 'user' ? 'User' : 'Technician'}: ${m.content}`)
        .join('\n');

      const llmParams = {
        prompt: `${AUTOMOTIVE_SYSTEM_PROMPT}\n\n---\n${history}\n\nTechnician:`,
        model: 'gemini_3_flash',
      };
      if (currentImage?.url) llmParams.file_urls = [currentImage.url];

      const response = await invokeWithRetry({ ...llmParams, queueKey: 'automotive-chat' }, 1);
      const reply = normalizeAssistantReply(response) || 'Nem érkezett értelmezhető diagnosztikai válasz.';

      setLastDiagnosis({
        diagnosis: reply,
        problemCode: msg.match(/P\d{4}|C\d{4}|B\d{4}|U\d{4}/)?.[0] || null,
        estimatedCost: 'Alacsony (£0-200) / Közepes (£200-800) / Magas (£800+)',
      });
      setLastParts([]);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      if (options?.fromVoice) await speakVoiceReply(reply);
    } catch (err) {
      console.error('[AutomotiveChat]', err?.message);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Hiba történt — próbáld újra.',
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, attachedImage, loading, messages, speakVoiceReply]);

  // Keep ref updated after sendMessage is defined
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  return {
    messages, input, setInput, loading, isListening, attachedImage, setAttachedImage,
    uploadingImage, lastDiagnosis, lastParts, setLastParts,
    fileInputRef, bottomRef,
    addMessage, resetChat, toggleVoice, handleImageAttach, sendMessage,
  };
}