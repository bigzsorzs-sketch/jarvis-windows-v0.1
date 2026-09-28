import { buildSystemPrompt, parseActions } from '@/lib/assistantTools';
import { detectLanguage, getLanguageInstruction } from '@/lib/languageEngine';
import { invokeWithRetry } from '@/lib/llmGateway';
import normalizeAssistantReply from '@/lib/normalizeAssistantReply';
import { sanitizeAssistantText } from '@/lib/assistantResponseHandler';
import { escapePromptValue } from '@/lib/assistantTools/sanitization';
import { buildFileAnalysisContext } from '@/lib/fileAnalysisContext';

function looksHungarian(text) {
  const lower = String(text || '').toLowerCase();
  return /[áéíóöőúüű]/i.test(lower) || /\b(szia|igen|nem|kérem|kérlek|rendben|miért|hogyan|mikor|hol|magyar|köszönöm|csináld|mondd|segíts|mozog|szád|fejlődtél|vagy|tudsz)\b/.test(lower);
}

function looksEnglish(text) {
  const lower = String(text || '').toLowerCase();
  return /\b(i am|i'm|i don|don't|cannot|can not|have a|physical|body|mouth|answer|user|english|sorry)\b/.test(lower);
}

async function enforceHungarianReply(reply) {
  const cleanReply = normalizeAssistantReply(reply);
  if (!looksEnglish(cleanReply)) return cleanReply;

  const translated = await invokeWithRetry({
    prompt: `Fordítsd le természetes, rövid magyar válaszra. Csak a magyar szöveget add vissza, magyarázat nélkül:\n\n${cleanReply}`,
    task_type: 'translation',
  }, 1).catch(() => null);

  return normalizeAssistantReply(translated) || cleanReply;
}

function shouldLockVoiceToHungarian(message, source, fallbackLang) {
  if (source !== 'voice') return false;
  if (fallbackLang === 'hu' || fallbackLang === 'hu-HU') return true;
  const clean = String(message || '').trim();
  return clean.length < 24 || !/[a-z]{3,}\s+[a-z]{3,}/i.test(clean);
}

export async function runAssistantTurn({ message, history, ctx, lang, userMood, attachedFiles = [], source = 'chat' }) {
  const fallbackLang = lang || 'hu';
  const detectedRaw = shouldLockVoiceToHungarian(message, source, fallbackLang) ? 'hu' : await detectLanguage(message, fallbackLang);
  const detectedLang = looksHungarian(message) ? 'hu' : detectedRaw;
  const forceHungarian = detectedLang === 'hu' || detectedLang === 'hu-HU';
  const outputLang = forceHungarian ? 'hu' : detectedLang;
  console.info('[voiceLanguage] Detected input language', { source, detectedLang, outputLang });
  const langInstruction = forceHungarian
    ? 'The user spoke Hungarian. You MUST answer only in Hungarian. Do not answer in English.'
    : getLanguageInstruction(outputLang, ctx?.settings?.secondary_languages || [], ctx?.settings?.formal_tone || false);
  const voiceSpeedInstruction = source === 'voice'
    ? '\nVoice mode is ACTIVE in Jarvis. You can hear the user through speech recognition and Jarvis can speak your reply aloud. Never claim that voice conversation is unavailable or text-only. Answer in Hungarian when input is Hungarian. Use 1 short sentence, maximum 18 words. Emojis may appear visually, but never describe or read emoji names aloud. No English unless the user spoke English.'
    : '\nAnswer concisely by default.';
  const systemPrompt = `${buildSystemPrompt(ctx, langInstruction, userMood)}${voiceSpeedInstruction}`;

  const compactHistory = history
    .slice(-12)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${escapePromptValue(m.content, 800)}`)
    .join('\n');
  const safeMessage = escapePromptValue(message, 2000);

  const fileAnalysisContext = await buildFileAnalysisContext(attachedFiles);

  const containsSensitiveContext = attachedFiles.length > 0
    || Boolean(ctx?.memories?.length)
    || Boolean(ctx?.meds?.length)
    || Boolean(ctx?.contacts?.length)
    || Boolean(ctx?.finance?.length)
    || Boolean(ctx?.bs?.length)
    || Boolean(ctx?.meals?.length)
    || Boolean(ctx?.invoices?.length);

  const llmParams = {
    prompt: `${systemPrompt}\n\nDetected input language: ${detectedLang}\nSelected output language: ${outputLang}\nCRITICAL LANGUAGE RULE: If selected output language is hu, reply ONLY in Hungarian. English words or English sentences are forbidden.\n\n${fileAnalysisContext}\n\nVOICE MODE LATENCY RULES:\n- Default to 1 short sentence, maximum 18 words.\n- For completed actions, confirm in 3-8 words.\n- Do not explain unless the user asks.\n- Ask at most one short follow-up question if needed.\n\n---\n${compactHistory}\nUser: ${safeMessage}\nAssistant:`,
    task_type: 'general',
    queueKey: 'assistant-turn',
    contains_sensitive_context: containsSensitiveContext,
  };

  const mediaUrls = attachedFiles.filter(f => f.kind === 'image' || f.kind === 'video').map(f => f.url);
  if (mediaUrls.length) llmParams.file_urls = mediaUrls;

  const startedAt = Date.now();
  const retryCount = 1;
  const proxyResponse = await invokeWithRetry(llmParams, retryCount);
  const latencyMs = Date.now() - startedAt;
  console.info('[voiceTiming] LLM finished', { source, latencyMs, retryCount });
  const rawReply = normalizeAssistantReply(proxyResponse, { preserveStructured: true });
  const actions = parseActions(rawReply);

  // Planning and execution are deliberately separated. The assistant turn may
  // propose actions, but the UI is the single execution owner so confirmation
  // can happen before any side effect.
  const actionFallback = forceHungarian ? 'Művelet előkészítve.' : 'Action prepared.';
  const visibleReply = sanitizeAssistantText(rawReply, actionFallback);
  const normalizedReply = forceHungarian ? await enforceHungarianReply(visibleReply) : visibleReply;

  return {
    reply: normalizedReply,
    actions,
    actionResults: [],
    detectedLang: outputLang,
    latencyMs,
    nextCtx: ctx,
  };
}