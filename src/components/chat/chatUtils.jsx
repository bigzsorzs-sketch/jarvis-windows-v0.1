export function getWindowedMessages(msgs) {
  if (msgs.length <= 50) return msgs;
  return msgs.slice(-50);
}

export function buildFileLabel(files) {
  const kindLabels = { image: '🖼️ Kép', video: '🎬 Videó', audio: '🎵 Hang', document: '📄 Dokumentum', code: '💻 Kód', archive: '🗜️ Archív' };
  return files.length > 0 ? files.map((f) => kindLabels[f.kind] || '📎 Fájl').join(', ') + ' csatolva' : null;
}

export function getChatErrorMessage(error, fallback = 'Valami hiba történt. Kérlek próbáld újra.') {
  const message = String(error?.message || error || '');

  if (/OPENROUTER_API_KEY_REQUIRED/i.test(message)) {
    return '⚠️ Nincs használható OpenRouter API-kulcs. Nyisd meg a Beállítások → AI részt, majd ellenőrizd a kapcsolatot.';
  }
  if (/OPENROUTER_(401|403)|OPENROUTER_CONNECTION_(401|403)/i.test(message)) {
    return '⚠️ Az OpenRouter API-kulcsot a szolgáltatás elutasította. Ellenőrizd vagy mentsd újra a kulcsot a Beállításokban.';
  }
  if (/OPENROUTER_402/i.test(message)) {
    return '⚠️ Az OpenRouter egyenleg vagy fizetési keret nem elegendő ehhez a kéréshez.';
  }
  if (/OPENROUTER_404/i.test(message)) {
    return '⚠️ A kiválasztott AI-modell most nem érhető el. Válassz másik modellt, vagy állítsd vissza az automatikus modellválasztást.';
  }
  if (/OPENROUTER_429|Too many|queue is full/i.test(message)) {
    return '⚠️ Az AI szolgáltatás jelenleg túlterhelt. Próbáld újra néhány másodperc múlva.';
  }
  if (/OPENROUTER_TIMEOUT|llm_timeout|timeout/i.test(message)) {
    return '⏱️ Az AI-válasz időtúllépés miatt megszakadt. Próbáld újra.';
  }
  if (/Assistant request already in progress/i.test(message)) {
    return '⏳ Az előző AI-kérés még fut. Várj egy pillanatot, majd küldd újra.';
  }
  if (/JARVIS_POLICY_USER_DENIED/i.test(message)) {
    return '🔒 Az AI-kérés nem indult el, mert az érzékeny adatok továbbítását nem engedélyezted.';
  }
  if (/JARVIS_POLICY_(BLOCKED|CONFIRMATION_REQUIRED)|JARVIS_OWNER_REQUIRED/i.test(message)) {
    return '🔒 A Jarvis védelmi rendszere leállította ezt az AI-kérést. A részletes ok bekerült a naplóba.';
  }
  if (/Empty response from LLM/i.test(message)) {
    return '⚠️ Az AI szolgáltatás üres választ adott. Próbáld újra.';
  }

  return fallback;
}
