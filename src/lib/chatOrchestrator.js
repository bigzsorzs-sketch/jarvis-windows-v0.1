import { loadFullContext, buildSystemPrompt, parseActions, executeActions } from '@/lib/assistantTools';
import { detectLanguage, getLanguageInstruction } from '@/lib/languageEngine';
import { invokeWithRetry } from '@/lib/llmGateway';
import normalizeAssistantReply from '@/lib/normalizeAssistantReply';
import { sanitizeAssistantText, summarizeActionResults } from '@/lib/assistantResponseHandler';
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
    model: 'gemini_3_flash',
  }, 1).catch(() => null);

  return normalizeAssistantReply(translated) || cleanReply;
}

function shouldLockVoiceToHungarian(message, source, fallbackLang) {
  if (source !== 'voice') return false;
  if (fallbackLang === 'hu' || fallbackLang === 'hu-HU') return true;
  const clean = String(message || '').trim();
  return clean.length < 24 || !/[a-z]{3,}\s+[a-z]{3,}/i.test(clean);
}

function normalizePrivacyText(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function requestsPrivateContext(text = '') {
  const input = normalizePrivacyText(text);
  return /(emlek|memoria|korabban|elozo|history|remember|gyogyszer|medication|kontakt|contact|telefon|email|penzugy|finance|szamla|invoice|bevetel|kiadas|egyenleg|vercukor|cukor|glucose|egeszseg|health|kaloria|etkezes|meal|feladat|todo|emlekezteto|reminder|uzlet|business|ugyfel|client)/.test(input);
}

function hasStoredPrivateContext(ctx) {
  return Boolean(ctx?.memories?.length)
    || Boolean(ctx?.meds?.length)
    || Boolean(ctx?.contacts?.length)
    || Boolean(ctx?.finance?.length)
    || Boolean(ctx?.bs?.length)
    || Boolean(ctx?.meals?.length)
    || Boolean(ctx?.invoices?.length)
    || Boolean(ctx?.todos?.length)
    || Boolean(ctx?.reminders?.length)
    || Boolean(ctx?.actions?.length)
    || Boolean(ctx?.ecosystem);
}

function publicOnlyContext(ctx) {
  return {
    settings: ctx?.settings || null,
    promptTunings: ctx?.promptTunings || [],
    memories: [], todos: [], finance: [], bs: [], meals: [], meds: [], contacts: [], reminders: [], actions: [], invoices: [],
    ecosystem: null,
  };
}

function safeHistoryForCloud(history = [], allowPrivate = false) {
  const recent = history.slice(allowPrivate ? -12 : -6);
  if (allowPrivate) return recent;
  return recent.filter((message) => !requestsPrivateContext(message?.content || ''));
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
    ? '\nVoice mode: answer in Hungarian when input is Hungarian. Use 1 short sentence, maximum 18 words. No English unless the user spoke English.'
    : '\nAnswer concisely by default.';

  const privateContextRequested = attachedFiles.length > 0 || requestsPrivateContext(message);
  const promptContext = privateContextRequested ? ctx : publicOnlyContext(ctx);
  const systemPrompt = `${buildSystemPrompt(promptContext, langInstruction, userMood)}${voiceSpeedInstruction}`;

  const selectedHistory = safeHistoryForCloud(history, privateContextRequested);
  const compactHistory = selectedHistory
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${escapePromptValue(m.content, 800)}`)
    .join('\n');
  const safeMessage = escapePromptValue(message, 2000);

  const fileAnalysisContext = await buildFileAnalysisContext(attachedFiles);

  const containsSensitiveContext = attachedFiles.length > 0
    || requestsPrivateContext(message)
    || (privateContextRequested && hasStoredPrivateContext(ctx));

  const llmParams = {
    prompt: `${systemPrompt}\n\nDetected input language: ${detectedLang}\nSelected output language: ${outputLang}\nCRITICAL LANGUAGE RULE: If selected output language is hu, reply ONLY in Hungarian. English words or English sentences are forbidden.\n\n${fileAnalysisContext}\n\nVOICE MODE LATENCY RULES:\n- Default to 1 short sentence, maximum 18 words.\n- For completed actions, confirm in 3-8 words.\n- Do not explain unless the user asks.\n- Ask at most one short follow-up question if needed.\n\n---\n${compactHistory}\nUser: ${safeMessage}\nAssistant:`,
    model: 'gemini_3_flash',
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
  const actionResults = actions.length > 0 ? await executeActions(actions) : [];
  const visibleReply = actions.length > 0 ? summarizeActionResults(actionResults) : sanitizeAssistantText(rawReply);
  const normalizedReply = forceHungarian && actions.length === 0 ? await enforceHungarianReply(visibleReply) : visibleReply;
  const nextCtx = actions.length > 0 ? await loadFullContext(true).catch(() => ctx) : ctx;

  return {
    reply: normalizedReply,
    actions,
    actionResults,
    detectedLang: outputLang,
    latencyMs,
    nextCtx,
  };
}