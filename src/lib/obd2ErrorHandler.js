// Standardized OBD2 error handling and response parsing
export const OBD2_ERROR_TYPES = {
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  PID_NOT_SUPPORTED: 'PID_NOT_SUPPORTED',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN'
};

export function parseOBD2Response(data) {
  if (!data) {
    return { success: false, error: OBD2_ERROR_TYPES.INVALID_RESPONSE, message: OBD2_ERROR_MESSAGES[OBD2_ERROR_TYPES.INVALID_RESPONSE] };
  }

  if (data.success === false) {
    return {
      success: false,
      error: data.error || OBD2_ERROR_TYPES.UNKNOWN,
      message: data.message || OBD2_ERROR_MESSAGES[data.error] || OBD2_ERROR_MESSAGES[OBD2_ERROR_TYPES.UNKNOWN]
    };
  }

  return { success: true, data: data.data };
}

export function handleOBD2Error(error) {
  const rawMessage = error?.message || '';

  if (!error) {
    return { error: OBD2_ERROR_TYPES.UNKNOWN, message: OBD2_ERROR_MESSAGES[OBD2_ERROR_TYPES.UNKNOWN], technical: 'unknown' };
  }

  if (rawMessage.includes('timeout')) {
    return { error: OBD2_ERROR_TYPES.TIMEOUT, message: OBD2_ERROR_MESSAGES[OBD2_ERROR_TYPES.TIMEOUT], technical: rawMessage };
  }

  if (rawMessage.includes('not supported')) {
    return { error: OBD2_ERROR_TYPES.PID_NOT_SUPPORTED, message: OBD2_ERROR_MESSAGES[OBD2_ERROR_TYPES.PID_NOT_SUPPORTED], technical: rawMessage };
  }

  if (rawMessage.includes('connection')) {
    return { error: OBD2_ERROR_TYPES.CONNECTION_FAILED, message: OBD2_ERROR_MESSAGES[OBD2_ERROR_TYPES.CONNECTION_FAILED], technical: rawMessage };
  }

  return { error: OBD2_ERROR_TYPES.UNKNOWN, message: OBD2_ERROR_MESSAGES[OBD2_ERROR_TYPES.UNKNOWN], technical: rawMessage };
}

export const OBD2_ERROR_MESSAGES = {
  [OBD2_ERROR_TYPES.CONNECTION_FAILED]: 'Az OBD2 kapcsolat megszakadt. Ellenőrizd a Bluetooth kapcsolatot.',
  [OBD2_ERROR_TYPES.INVALID_RESPONSE]: 'Érvénytelen válasz érkezett az OBD2 eszköztől.',
  [OBD2_ERROR_TYPES.PID_NOT_SUPPORTED]: 'Ez az adat nem támogatott ennél az autónál.',
  [OBD2_ERROR_TYPES.TIMEOUT]: 'Túl sokáig tartott a kommunikáció az eszközzel.',
  [OBD2_ERROR_TYPES.UNKNOWN]: 'Váratlan OBD2 hiba történt.'
};