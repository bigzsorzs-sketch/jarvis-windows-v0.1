let pendingVoiceCommand = null;

export function queueVoiceCommand(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  pendingVoiceCommand = { text:value, queuedAt:Date.now() };
  return pendingVoiceCommand;
}

export function takeQueuedVoiceCommand(maxAgeMs = 15000) {
  const item = pendingVoiceCommand;
  pendingVoiceCommand = null;
  if (!item) return null;
  if (Date.now() - item.queuedAt > maxAgeMs) return null;
  return item;
}
