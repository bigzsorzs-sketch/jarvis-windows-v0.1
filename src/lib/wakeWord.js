function fold(text='') {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[,.!?;:]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

const DEFAULT_ALIASES = ['jarvis','járvis','jarwis','zsárvis','dzsárvis','jarvish'];

export function wakeWordAliases(word='jarvis') {
  const clean = fold(word);
  return [...new Set([clean, ...DEFAULT_ALIASES.map(fold)].filter(Boolean))];
}

export function extractWakeWordCommand(transcript='', word='jarvis') {
  const original = String(transcript || '').trim();
  const normalized = fold(original);
  if (!normalized) return { matched:false, command:'' };

  const aliases = wakeWordAliases(word);
  const alias = aliases.find((item) =>
    normalized === item ||
    normalized.startsWith(item + ' ') ||
    normalized.includes(' ' + item + ' ')
  );
  if (!alias) return { matched:false, command:'' };

  const words = original.split(/\s+/);
  const normalizedWords = words.map(fold);
  const index = normalizedWords.findIndex((item) => aliases.includes(item));
  const command = index >= 0 ? words.slice(index + 1).join(' ').trim() : '';
  return { matched:true, command, wakeWord:alias };
}
