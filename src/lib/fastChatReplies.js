function normalizeText(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function findFastChatReply(text, lang = 'hu') {
  const input = normalizeText(text).replace(/[!?.,]+$/g, '');
  if (!input || input.length > 80) return null;

  const isHungarian = lang === 'hu' || /\b(hogy|szia|koszi|köszönöm|vagy|vagyok)\b/i.test(text);

  if (/^(milyen nap van ma|mi a mai datum|mi a mai dátum|hanyadika van|hányadika van|what day is it|what is the date today)$/.test(input)) {
    const now = new Date();
    const locale = isHungarian ? 'hu-HU' : 'en-GB';
    const formatted = new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(now);
    return {
      handled: true,
      intent: 'fast_local_date',
      reply: isHungarian ? `Ma ${formatted} van.` : `Today is ${formatted}.`,
    };
  }

  if (/^(mennyi az ido|mennyi az idő|hany ora van|hány óra van|what time is it)$/.test(input)) {
    const now = new Date();
    const locale = isHungarian ? 'hu-HU' : 'en-GB';
    const formatted = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(now);
    return {
      handled: true,
      intent: 'fast_local_time',
      reply: isHungarian ? `A helyi idő ${formatted}.` : `The local time is ${formatted}.`,
    };
  }

  if (/^(szia|hello|helo|hali|jo napot|jó napot|hey)$/.test(input)) {
    return {
      handled: true,
      intent: 'fast_greeting',
      reply: isHungarian ? 'Szia! Itt vagyok, miben segítsek?' : 'Hi! I’m here, how can I help?',
    };
  }

  if (/^(hogy vagy|hogy vagy ma|mizu|mi ujsag|mi újság)$/.test(input)) {
    return {
      handled: true,
      intent: 'fast_smalltalk',
      reply: 'Jól vagyok, köszönöm. Készen állok segíteni.',
    };
  }

  if (/^(koszi|köszi|koszonom|köszönöm|thanks|thank you)$/.test(input)) {
    return {
      handled: true,
      intent: 'fast_thanks',
      reply: isHungarian ? 'Szívesen.' : 'You’re welcome.',
    };
  }

  if (/^(ok|oke|oké|rendben|jo|jó)$/.test(input)) {
    return {
      handled: true,
      intent: 'fast_ack',
      reply: isHungarian ? 'Rendben.' : 'Okay.',
    };
  }

  if (/(hallasz|hallod|mukodsz|működsz|itt vagy|figyelsz)/.test(input)) {
    return {
      handled: true,
      intent: 'fast_status',
      reply: 'Igen, itt vagyok és figyelek.',
    };
  }

  return null;
}