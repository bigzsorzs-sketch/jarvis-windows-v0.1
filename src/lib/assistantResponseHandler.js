export const SAFE_ASSISTANT_FALLBACK = 'Something went wrong. Please try again.';

const ACTION_BLOCK_PATTERN = /```(?:actions?|json)?\s*([\s\S]*?)```/gi;
const LEGACY_ACTION_PATTERN = /\[ACTION:[^\]]+\]/gi;

function looksLikeToolPayload(text = '') {
  const value = String(text || '').trim();
  if (!value) return false;
  const legacyPattern = /\[ACTION:[^\]]+\]/i;
  return /"?(tool|function|action|params|arguments|tool_calls|actionResults|actions)"?\s*[:=]/i.test(value)
    || /```actions?/i.test(value)
    || legacyPattern.test(value);
}

function stripActionBlocks(text = '') {
  return String(text || '').replace(ACTION_BLOCK_PATTERN, (full, inner) => {
    const header = full.replace('```', '').trim();
    const body = String(inner || '').trim();
    const structuredBody = (body.startsWith('{') && body.endsWith('}')) || (body.startsWith('[') && body.endsWith(']'));
    return looksLikeToolPayload(inner) || /^actions?|^json/i.test(header) || structuredBody ? '' : full;
  });
}

function stripStandaloneStructuredPayload(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  const startsStructured = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
  if (!startsStructured) return trimmed;

  return '';
}

export function sanitizeAssistantText(value, fallback = SAFE_ASSISTANT_FALLBACK) {
  let text = typeof value === 'string' ? value : '';
  text = stripActionBlocks(text);
  text = text.replace(LEGACY_ACTION_PATTERN, '');
  text = stripStandaloneStructuredPayload(text);
  text = text.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '');
  text = text.trim();

  if (!text || looksLikeToolPayload(text)) return fallback;
  return text;
}

export function summarizeActionResults(results = []) {
  if (!Array.isArray(results) || results.length === 0) return 'Done.';
  const failed = results.filter((item) => item?.result?.success === false).length;
  if (failed === results.length) return 'Something went wrong. Please try again.';
  if (failed > 0) return 'Done, but some parts could not be completed.';
  return 'Done.';
}