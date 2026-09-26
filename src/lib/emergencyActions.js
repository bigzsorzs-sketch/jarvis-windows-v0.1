/**
 * Emergency actions are deliberately explicit.
 * Jarvis only attempts a call when the user directly asks for 999/112.
 * Desktop operating systems may hand tel: URLs to Phone Link or another handler;
 * Jarvis must never claim the call connected unless the platform confirms it.
 */

export async function requestEmergencyCall(number = '999') {
  const normalized = String(number || '').replace(/\D/g, '');
  if (!['999', '112'].includes(normalized)) {
    return { success: false, message: 'Csak a 999 vagy 112 segélyhívó szám kezelhető ebben a műveletben.' };
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const mobileLike = /Android|iPhone|iPad/i.test(ua);

  try {
    if (window.jarvisDesktop?.openEmergencyCall) {
      const result = await window.jarvisDesktop.openEmergencyCall(normalized);
      return {
        success: true,
        message: 'Megpróbáltam átadni a ' + normalized + ' segélyhívást a Windows híváskezelőjének. Ellenőrizd, hogy a hívás valóban elindult; ha nem, hívd a ' + normalized + ' számot telefonról.',
        data: { ...result, callAttempted: true, platformConfirmedConnected: false },
      };
    }

    window.location.href = 'tel:' + normalized;
  } catch {
    return {
      success: false,
      message: 'Nem tudtam megnyitni a telefonhívást. Hívd a ' + normalized + ' számot egy telefonról.',
      data: { number: normalized, callAttempted: false },
    };
  }

  return {
    success: true,
    message: mobileLike
      ? 'Megnyitottam a ' + normalized + ' segélyhívást. Ellenőrizd, hogy a hívás valóban elindult.'
      : 'Megpróbáltam átadni a ' + normalized + ' hívást a rendszer híváskezelőjének. Ha nem jelenik meg hívás, hívd a ' + normalized + ' számot telefonról.',
    data: { number: normalized, callAttempted: true, platformConfirmedConnected: false },
  };
}
