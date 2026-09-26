export function getWindowedMessages(msgs) {
  if (msgs.length <= 50) return msgs;
  return msgs.slice(-50);
}

export function buildFileLabel(files) {
  const kindLabels = { image: '🖼️ Kép', video: '🎬 Videó', audio: '🎵 Hang', document: '📄 Dokumentum', code: '💻 Kód', archive: '🗜️ Archív' };
  return files.length > 0 ? files.map((f) => kindLabels[f.kind] || '📎 Fájl').join(', ') + ' csatolva' : null;
}