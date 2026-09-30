import { sanitizeAssistantText, SAFE_ASSISTANT_FALLBACK } from '@/lib/assistantResponseHandler';

export const FALLBACK_ASSISTANT_REPLY = SAFE_ASSISTANT_FALLBACK;

const INTERNAL_KEYS = new Set(['usage', 'tokens', 'token_usage', 'cost', 'estimated_cost', 'latency_ms', 'model']);

function extractResult(payload, depth = 0) {
  if (depth > 8) return '';
  if (typeof payload === 'string') {
    return payload;
  }
  if (!payload || typeof payload !== 'object') return '';

  if (typeof payload.result === 'string') return payload.result;
  if (typeof payload.message === 'string' && !payload.message.trim().startsWith('{')) return payload.message;
  if (typeof payload.content === 'string' && !payload.content.trim().startsWith('{')) return payload.content;

  const wrappers = [payload.data, payload.response, payload.payload, payload.output];
  for (const wrapper of wrappers) {
    const extracted = extractResult(wrapper, depth + 1);
    if (extracted) return extracted;
  }

  const safeEntries = Object.entries(payload).filter(([key]) => !INTERNAL_KEYS.has(key));
  for (const [, value] of safeEntries) {
    const extracted = extractResult(value, depth + 1);
    if (extracted) return extracted;
  }

  return '';
}

export default function normalizeAssistantReply(response, options = {}) {
  const extracted = extractResult(response);
  const raw = typeof extracted === 'string' && extracted.trim() ? extracted.trim() : FALLBACK_ASSISTANT_REPLY;
  const normalized = options.preserveStructured ? raw : sanitizeAssistantText(raw, FALLBACK_ASSISTANT_REPLY);
  if (import.meta.env?.DEV) console.info('ASSISTANT_REPLY_NORMALIZED', { hasText: !!normalized });
  return normalized;
}