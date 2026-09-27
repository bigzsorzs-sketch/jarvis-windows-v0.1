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
  const raw = String(text || '');
  const input = normalizePrivacyText(raw);

  const semanticSensitive = /(emlek|memoria|korabban|elozo|history|remember|gyogyszer|medication|kontakt|contact|telefon|phone|email|cim|address|lakcim|postcode|iranyitoszam|penzugy|finance|bank|kartya|card|szamla|invoice|bevetel|kiadas|egyenleg|balance|tartoz|debt|vercukor|cukor|glucose|egeszseg|health|kaloria|etkezes|meal|feladat|todo|emlekezteto|reminder|uzlet|business|ugyfel|client|jelszo|password|api key|token|nevem|my name|szulett|date of birth|dob|lakom|i live)/.test(input);
  const emailLike = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(raw);
  const ukPostcodeLike = /\b(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i.test(raw);
  const phoneLike = /(?:\+?44\s?|0)\d(?:[\s()-]*\d){8,12}/.test(raw);
  const moneyLike = /(?:£|€|\$)\s?\d[\d,.]*/.test(raw);
  const healthMetricLike = /\b\d{1,2}(?:\.\d+)?\s*(?:mmol\/?l|mg\/?dl|bpm|mmhg)\b/i.test(raw);

  return semanticSensitive || emailLike || ukPostcodeLike || phoneLike || moneyLike || healthMetricLike;
}

function selectPrivateContext(ctx, text = '') {
  const input = normalizePrivacyText(text);
  const wantsMemory = /(emlek|memoria|korabban|elozo|history|remember)/.test(input);
  const wantsHealth = /(gyogyszer|medication|vercukor|cukor|glucose|egeszseg|health|kaloria|etkezes|meal|mmol|mg\/dl)/.test(input);
  const wantsContacts = /(kontakt|contact|telefon|phone|email|cim|address|lakcim|postcode|iranyitoszam)/.test(input);
  const wantsFinance = /(penzugy|finance|bank|kartya|card|szamla|invoice|bevetel|kiadas|egyenleg|balance|tartoz|debt|£|€|\$)/.test(input);
  const wantsTasks = /(feladat|todo|emlekezteto|reminder)/.test(input);
  const wantsBusiness = /(uzlet|business|ugyfel|client|projekt|project|employee|alkalmazott)/.test(input);

  return {
    settings: ctx?.settings || null,
    promptTunings: ctx?.promptTunings || [],
    memories: wantsMemory ? (ctx?.memories || []) : [],
    meds: wantsHealth ? (ctx?.meds || []) : [],
    bs: wantsHealth ? (ctx?.bs || []) : [],
    meals: wantsHealth ? (ctx?.meals || []) : [],
    contacts: wantsContacts ? (ctx?.contacts || []) : [],
    finance: wantsFinance ? (ctx?.finance || []) : [],
    invoices: (wantsFinance || wantsBusiness) ? (ctx?.invoices || []) : [],
    todos: wantsTasks ? (ctx?.todos || []) : [],
    reminders: wantsTasks ? (ctx?.reminders || []) : [],
    actions: [],
    ecosystem: wantsBusiness ? (ctx?.ecosystem || null) : null,
  };
}

function buildPublicSystemPrompt(ctx, langInstruction = '', userMood = 'neutral') {
  const settings = ctx?.settings || {};
  const tuningInstructions = (ctx?.promptTunings || [])
    .filter((item) => item.status === 'active' && item.proposed_instruction)
    .map((item) => `- ${escapePromptValue(item.proposed_instruction, 600)}`)
    .join('\n');
  const currentDateTime = new Intl.DateTimeFormat('hu-HU', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date());

  return `You are a unified desktop AI assistant.
Name: ${settings.ai_name || 'Jarvis'} | Personality: ${settings.personality || 'kedves'} | User Mood: ${userMood}
${langInstruction}

CURRENT LOCAL DATE AND TIME: ${currentDateTime}

APPROVED PROMPT TUNING:
${tuningInstructions || 'No approved tuning instructions.'}

CAPABILITIES:
[MEMORY] save_memory, search_data
[PRODUCTIVITY] create_task, create_reminder, create_note
[HEALTH] log_blood_sugar, log_meal
[FINANCE] log_finance, create_invoice, generate_pdf
[COMMUNICATION] draft_email, call_contact, create_contact, search_contacts
[LANGUAGE] translate_text
[SMART HOME] control_device, check_device_status, trigger_scene, run_routine
[BUSINESS] analyze_ecosystem, optimize_workload, optimize_revenue

RULES:
1. Always respond in the user's language.
2. Never assume or invent personal data that is not present in the current request.
3. When you need to perform an action, output actions only inside an actions code block containing a JSON array.
4. Ask for missing critical information before acting.
5. Keep responses short and concrete.
6. For simple conversation, answer directly without generating actions.

TOOL SYNTAX: Use an actions code block containing JSON objects with tool and params fields.`;
}

function safeHistoryForCloud(history = []) {
  return history
    .slice(-6)
    .filter((item) => !requestsPrivateContext(item?.content || ''));
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
  const selectedPrivateContext = privateContextRequested ? selectPrivateContext(ctx, message) : null;
  const systemPrompt = `${privateContextRequested
    ? buildSystemPrompt(selectedPrivateContext, langInstruction, userMood)
    : buildPublicSystemPrompt(ctx, langInstruction, userMood)}${voiceSpeedInstruction}`;

  const selectedHistory = safeHistoryForCloud(history);
  const compactHistory = selectedHistory
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${escapePromptValue(m.content, 800)}`)
    .join('\n');
  const safeMessage = escapePromptValue(message, 2000);

  const fileAnalysisContext = await buildFileAnalysisContext(attachedFiles);

  const containsSensitiveContext = attachedFiles.length > 0 || privateContextRequested;

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