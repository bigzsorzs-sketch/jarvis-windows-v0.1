export function getAssistantErrorMessage(error, fallback = 'Valami hiba történt. Kérlek próbáld újra.') {
  const message = String(error?.message || error || '');

  if (message.includes('OPENROUTER_API_KEY_REQUIRED')) {
    return '⚠️ Az AI funkciókhoz még nincs OpenRouter API-kulcs beállítva. A helyi Jarvis-funkciók ettől továbbra is működnek.';
  }

  if (message.includes('OPENROUTER_401') || /\b401\b/.test(message)) {
    return '⚠️ Az OpenRouter API-kulcsot a szolgáltató elutasította. Ellenőrizd a Beállításokban.';
  }

  if (message.includes('OPENROUTER_402') || /\b402\b/.test(message)) {
    return '⚠️ Az OpenRouter-fiókban nincs elegendő egyenleg ehhez az AI-kéréshez.';
  }

  if (message.includes('OPENROUTER_429') || /\b429\b/.test(message) || /too many/i.test(message)) {
    return '⚠️ Az AI-szolgáltatás túlterhelt vagy elérted a kérési limitet. Próbáld újra rövidesen.';
  }

  if (message.includes('JARVIS_POLICY_USER_DENIED')) {
    return 'A műveletet megszakítottad, ezért semmilyen érzékeny adat nem lett elküldve.';
  }

  if (message.includes('JARVIS_POLICY_CONFIRMATION_REQUIRED')) {
    return '⚠️ Ehhez a művelethez tulajdonosi megerősítés szükséges.';
  }

  if (/timeout|timed out|aborted/i.test(message)) {
    return '⏱️ A művelet időtúllépés miatt nem fejeződött be. Próbáld újra.';
  }

  if (/network|offline|fetch failed|ENOTFOUND|ECONN/i.test(message)) {
    return '⚠️ Hálózati hiba történt. Ellenőrizd az internetkapcsolatot.';
  }

  return fallback;
}

export default getAssistantErrorMessage;
