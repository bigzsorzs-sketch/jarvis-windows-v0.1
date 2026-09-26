export function isCallCommand(text = '') {
  const lower = text.toLowerCase().trim();
  return (lower.includes('hívj') || lower.includes('hívd') || lower.includes('tárcsázd'));
}

export function extractCallTarget(text = '') {
  const lower = text.toLowerCase().trim();
  const cleaned = lower.replace(/[.!?,]+$/g, '').trim();
  const match = cleaned.match(/hívd?\s+(?:fel\s+)?(.+?)(?:\s+számát)?$/) || cleaned.match(/hívj\s+fel\s+(.+?)(?:\s+számát)?$/) || cleaned.match(/tárcsázd\s+(.+?)(?:\s+számát)?$/);
  return match?.[1]?.trim() || '';
}

export function isNavigationVoiceCommand(text = '') {
  const lower = text.toLowerCase().trim();
  return lower.includes('navigate to') || lower.includes('take me to') || lower.includes('indulok ') || lower.includes('navigálj ') || lower.includes('navigalj ');
}

export function extractNavigationTarget(text = '') {
  const lower = text.toLowerCase().trim().replace(/[.!?,]+$/g, '');
  const match = lower.match(/navigate to\s+(.+)$/) || lower.match(/take me to\s+(.+)$/) || lower.match(/indulok\s+(.+?)(?:-?hoz|-?hez)?$/) || lower.match(/navigálj\s+(.+)$/) || lower.match(/navigalj\s+(.+)$/);
  return match?.[1]?.trim() || '';
}

export function isFinishTripCommand(text = '') {
  const lower = text.toLowerCase().trim();
  return lower === 'finish trip' || lower === 'út vége' || lower === 'ut vege';
}

export function isLastTripSummaryCommand(text = '') {
  const lower = text.toLowerCase().trim();
  return lower.includes('utolsó út összefoglal')
    || lower.includes('utolso ut osszefoglal')
    || lower.includes('foglald össze az utolsó utat')
    || lower.includes('foglald ossze az utolso utat')
    || lower.includes('summarize last trip');
}

export function isShareNavigationDestinationCommand(text = '') {
  const lower = text.toLowerCase().trim();
  return (lower.includes('navigációs célpont') || lower.includes('navigacios celpont') || lower.includes('úticél') || lower.includes('uticel') || lower.includes('célpont') || lower.includes('celpont'))
    && (lower.includes('oszd meg') || lower.includes('küldd el') || lower.includes('kuld el') || lower.includes('megoszt'));
}

export function extractShareNavigationContact(text = '') {
  const lower = text.toLowerCase().trim().replace(/[.!?,]+$/g, '');
  const match = lower.match(/(?:kontakt(?:nak)?|kapcsolat(?:nak)?|neki|címzett(?:nek)?|cimzett(?:nek)?)\s+(.+)$/)
    || lower.match(/(?:oszd meg|küldd el|kuld el|megoszt(?:ása)?)\s+(?:a\s+)?(?:navigációs\s+célpontot|navigacios\s+celpontot|úticélt|uticelt|célpontot|celpontot)\s+(.+)$/)
    || lower.match(/(.+?)(?:nak|nek|val|vel|ral|rel)$/);
  return match?.[1]?.trim() || '';
}

export function isGlobalVoiceCommand(text = '') {
  return isCallCommand(text)
    || isNavigationVoiceCommand(text)
    || isFinishTripCommand(text)
    || isLastTripSummaryCommand(text)
    || isShareNavigationDestinationCommand(text);
}