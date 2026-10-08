export const SAFE_ASSISTANT_FALLBACK = 'Something went wrong. Please try again.';

const ACTION_BLOCK_PATTERN = /```actions?\s*([\s\S]*?)```/gi;
const LEGACY_ACTION_PATTERN = /\[ACTION:[^\]]+\]/gi;

function isStructuredInternalPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Array.isArray(value.tool_calls)
    || Array.isArray(value.actionResults)
    || Array.isArray(value.actions)
    || (value.type === 'function' && typeof value.function?.name === 'string')
    || (typeof value.tool === 'string' && ('params' in value || 'arguments' in value));
}

export function isInternalAssistantOperationEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  // Only trust a structured transport envelope. JSON text inside result/content
  // is user-visible text and must never be reclassified by field names alone.
  const data = value.data;
  return isStructuredInternalPayload(data);
}

export function sanitizeAssistantText(value, fallback = SAFE_ASSISTANT_FALLBACK, options = {}) {
  if (typeof value !== 'string') return fallback;
  if (options.internalPayload === true) return fallback;

  const text = value
    .replace(ACTION_BLOCK_PATTERN, '')
    .replace(LEGACY_ACTION_PATTERN, '')
    .trim();

  return text || fallback;
}

export function summarizeActionResults(results = [], lang = 'en') {
  const hu = String(lang || '').toLowerCase().startsWith('hu');
  if (!Array.isArray(results) || results.length === 0) return hu ? 'Kész.' : 'Done.';
  const failed = results.filter((item) => item?.blocked || item?.result?.success !== true).length;
  if (failed === results.length) return hu ? 'A művelet nem sikerült. Próbáld újra.' : 'Something went wrong. Please try again.';
  if (failed > 0) return hu ? 'Kész, de néhány rész nem sikerült.' : 'Done, but some parts could not be completed.';
  return hu ? 'Kész.' : 'Done.';
}
