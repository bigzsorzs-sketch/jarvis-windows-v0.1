const EMOJI_RE = /[\p{Extended_Pictographic}\uFE0F\u200D]/gu;

export function sanitizeForSpeech(input) {
  return String(input || '')
    .replace(/\`\`\`[\s\S]*?\`\`\`/g, ' ')
    .replace(/\`([^\`]+)\`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/[*_~>|]+/g, ' ')
    .replace(EMOJI_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getVoicePreferences() {
  try {
    return {
      name: localStorage.getItem('jarvisTtsVoice') || '',
      rate: Number(localStorage.getItem('jarvisTtsRate') || '0.96'),
      pitch: Number(localStorage.getItem('jarvisTtsPitch') || '1.04'),
    };
  } catch { return { name:'', rate:0.96, pitch:1.04 }; }
}

export function saveVoicePreferences({ name='', rate=0.96, pitch=1.04 }) {
  try {
    localStorage.setItem('jarvisTtsVoice', name);
    localStorage.setItem('jarvisTtsRate', String(rate));
    localStorage.setItem('jarvisTtsPitch', String(pitch));
  } catch {}
}

export function chooseVoice(voices, lang='hu-HU', preferredName='') {
  const list = Array.from(voices || []);
  if (preferredName) {
    const exact = list.find(v => v.name === preferredName);
    if (exact) return exact;
  }
  const prefix = String(lang).split('-')[0].toLowerCase();
  const localized = list.filter(v => String(v.lang || '').toLowerCase().startsWith(prefix));
  const naturalHint = /(natural|online|neural|szabolcs|noemi|noémi|anna|female|woman)/i;
  return localized.find(v => naturalHint.test(v.name || '')) || localized[0] || list.find(v => v.default) || null;
}
