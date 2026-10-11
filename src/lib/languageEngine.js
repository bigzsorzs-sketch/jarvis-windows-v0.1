import { invokeWithRetry } from '@/lib/llmGateway';

// ─── SUPPORTED LANGUAGES – re-exported from i18n ─────────────────────────────
import { SUPPORTED_LANGUAGES } from '@/lib/i18n';
export { SUPPORTED_LANGUAGES };

// ─── DETECT LANGUAGE FROM TEXT ───────────────────────────────────────────────
// Fast heuristic check – avoids LLM call for common cases
const HU_MARKERS = /\b(és|van|nem|hogy|az|egy|is|de|meg|vagy|fel|le|ki|be|el|ezt|azt|volt|kell|már|csak|mint|még|igen|hol|mit|mikor|miért|hogyan|én|te|ő|mi|ti|ők)\b/i;
const EN_MARKERS = /\b(the|is|are|was|were|have|has|had|will|would|could|should|this|that|with|from|what|when|where|why|how|please|hello|hi|yes|no|and|or|but|not)\b/i;
const DE_MARKERS = /\b(ich|du|er|sie|wir|ist|bin|haben|wird|nicht|und|oder|mit|für|auf|das|die|der|ein|eine|zu|von)\b/i;
const FR_MARKERS = /\b(je|tu|il|elle|nous|vous|ils|est|sont|pas|les|des|une|avec|pour|dans|sur|que|qui|quoi|comment|pourquoi)\b/i;
const ES_MARKERS = /\b(yo|tú|él|es|son|una|los|las|con|por|para|que|qué|cómo|cuándo|dónde|está|estoy|tengo|hacer)\b/i;

export function detectLanguageHeuristic(text) {
  const t = String(text ?? '').toLowerCase();
  // Count all Unicode words. JavaScript \b does not recognise accented
  // Hungarian words, and a non-global match used to count at most one hit.
  const words = t.match(/\p{L}+/gu) || [];
  const count = markers => {
    const vocabulary = new Set(markers.source.slice(3, -3).split('|'));
    return words.filter(word => vocabulary.has(word)).length;
  };
  const scores = {
    hu: count(HU_MARKERS), en: count(EN_MARKERS), de: count(DE_MARKERS),
    fr: count(FR_MARKERS), es: count(ES_MARKERS),
  };
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  // Only return a result if there's a clear winner (at least 1 match)
  if (sorted[0][1] === 0 || sorted[0][1] === sorted[1][1]) return null;
  return sorted[0][0];
}

// Full LLM-based language detection (used when heuristic is uncertain)
export async function detectLanguageLLM(text, options = {}) {
  const requestOrigin = options.requestOrigin || options.request_origin;
  const result = await invokeWithRetry({
    prompt: `Detect the language and return a JSON object with one field, "language", containing its supported language code. Text: ${JSON.stringify(String(text ?? '').substring(0, 200))}`,
    request_origin: requestOrigin,
    response_json_schema: {
      type: 'object',
      properties: { language: { type:'string', enum:SUPPORTED_LANGUAGES.map(item => item.code) } },
      required: ['language'], additionalProperties:false,
    }
  });
  const parsed = typeof result === 'string' ? JSON.parse(result) : result;
  if (!SUPPORTED_LANGUAGES.some(item => item.code === parsed?.language)) throw new Error('UNSUPPORTED_DETECTED_LANGUAGE');
  return parsed.language;
}

// Main detection – heuristic first, LLM fallback
export async function detectLanguage(text, fallbackLanguage = 'hu', options = {}) {
  const clean = String(text || '').trim();
  if (!clean || clean.length < 3) return fallbackLanguage;
  const heuristic = detectLanguageHeuristic(clean);
  if (heuristic) return heuristic;
  if ((fallbackLanguage === 'hu' || fallbackLanguage === 'hu-HU') && clean.length < 24) return 'hu';
  try { return await detectLanguageLLM(clean, options); }
  catch { return SUPPORTED_LANGUAGES.some(item => item.code === fallbackLanguage) ? fallbackLanguage : 'hu'; }
}

// ─── TRANSLATE TOOL ───────────────────────────────────────────────────────────
export async function translateText(input, targetLanguage, preserveContext = true) {
  const langName = SUPPORTED_LANGUAGES.find(l => l.code === targetLanguage)?.name || targetLanguage;
  const result = await invokeWithRetry({
    prompt: `You are a professional translator. Translate the following text to ${langName}.
${preserveContext ? 'Preserve the meaning, tone, and intent. Do NOT do a literal word-for-word translation – make it natural and idiomatic.' : ''}
Return ONLY the translated text, nothing else.

Text to translate:
${input}`,
  });
  return typeof result === 'string' ? result.trim() : String(result).trim();
}

// ─── LANGUAGE INSTRUCTION FOR SYSTEM PROMPT ──────────────────────────────────
export function getLanguageInstruction(detectedLang, preferredLangs = [], formalTone = false) {
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === detectedLang);
  const langName = lang?.name || 'the user\'s language';

  const toneNote = formalTone
    ? 'Use a formal, professional tone.'
    : 'Use a natural, conversational tone.';

  return `
━━━ LANGUAGE INTELLIGENCE ━━━
CURRENT USER LANGUAGE: ${langName} (${detectedLang})
RESPONSE RULE: Always respond in ${langName}. Do NOT switch languages unless explicitly asked.
TONE: ${toneNote}
CROSS-LANGUAGE: Understand instructions in any language. If asked to write/translate something in another language, do so naturally.
MIXED INPUT: Handle mixed-language inputs gracefully (e.g. "Write an email in English about...").
MEMORY: Access and reference stored memories regardless of the language they were saved in.
PREFERRED LANGUAGES: ${preferredLangs.length > 0 ? preferredLangs.join(', ') : 'auto-detect'}
`.trim();
}

// ─── TTS HELPER ───────────────────────────────────────────────────────────────
export function getSpeechLangCode(langCode) {
  return SUPPORTED_LANGUAGES.find(l => l.code === langCode)?.speechCode || 'en-US';
}

export function speakText(text, langCode = 'en', onEnd = null) {
  if (!window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = getSpeechLangCode(langCode);
  utterance.rate = 0.95;
  if (onEnd) utterance.onend = onEnd;
  window.speechSynthesis.speak(utterance);
}
