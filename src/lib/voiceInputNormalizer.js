export function normalizeHungarianSpeechInput(text = '') {
  return String(text)
    .replace(/krom\b/giu, 'kor')
    .replace(/\s+/g, ' ')
    .trim();
}
