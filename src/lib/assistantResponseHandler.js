export const SAFE_ASSISTANT_FALLBACK = 'Something went wrong. Please try again.';

const ACTION_BLOCK_PATTERN = /```([a-z]*)\s*([\s\S]*?)```/gi;
const LEGACY_ACTION_PATTERN = /\[ACTION:[^\]]+\]/gi;

function isToolPayload(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.length > 0 && value.every(isToolPayload);
  return (typeof value.tool === 'string' && ('params' in value || 'arguments' in value))
    || (value.type === 'function' && typeof value.function?.name === 'string')
    || Array.isArray(value.tool_calls) || Array.isArray(value.actionResults)
    || (Array.isArray(value.actions) && value.actions.some(isToolPayload));
}
function looksLikeToolPayload(text) {
  try { return isToolPayload(JSON.parse(text)); } catch { return false; }
}

export function sanitizeAssistantText(value, fallback = SAFE_ASSISTANT_FALLBACK) {
  if (typeof value !== 'string') return fallback;
  const text = value.replace(ACTION_BLOCK_PATTERN, (full, language, body) => (
    /^actions?$/i.test(language) || looksLikeToolPayload(body.trim()) ? '' : full
  )).replace(LEGACY_ACTION_PATTERN, '').trim();
  return !text || looksLikeToolPayload(text) ? fallback : text;
}

export function summarizeActionResults(results = [], lang = 'en') {
  const hu = String(lang || '').toLowerCase().startsWith('hu');
  if (!Array.isArray(results) || results.length === 0) return hu ? 'Kész.' : 'Done.';
  const failed = results.filter((item) => item?.result?.success === false).length;
  if (failed === results.length) return hu ? 'A művelet nem sikerült. Próbáld újra.' : 'Something went wrong. Please try again.';
  if (failed > 0) return hu ? 'Kész, de néhány rész nem sikerült.' : 'Done, but some parts could not be completed.';
  return hu ? 'Kész.' : 'Done.';
}