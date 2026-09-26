/**
 * Centralized logger.
 * - Internal (console) logs are always detailed.
 * - userMessage() returns a SAFE, short message for the UI — never exposes stack traces.
 */

export const IS_DEV = import.meta.env?.DEV === true;

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = IS_DEV ? LEVELS.debug : LEVELS.info;

function fmt(level, module, message, meta) {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
  return `[${ts}] [${level.toUpperCase()}] [${module}] ${message}${metaStr}`;
}

function log(level, module, message, meta) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const line = fmt(level, module, message, meta);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (module, msg, meta)  => log('debug', module, msg, meta),
  info:  (module, msg, meta)  => log('info',  module, msg, meta),
  warn:  (module, msg, meta)  => log('warn',  module, msg, meta),
  error: (module, msg, meta)  => log('error', module, msg, meta),

  /**
   * Returns a safe, user-facing error message.
   * Never exposes internal errors, stack traces, or sensitive data.
   */
  userMessage(category, lang = 'hu') {
    const dictionary = {
      hu: {
        auth: 'Hitelesítési hiba. Kérlek jelentkezz be újra.',
        network: 'Hálózati hiba. Ellenőrizd az internetkapcsolatod.',
        llm: 'Az AI nem tudott válaszolni. Próbáld újra.',
        speech: 'Hangfelismerési hiba történt.',
        context: 'Az adatok betöltése sikertelen. Frissítsd az oldalt.',
        notif: 'Értesítési hiba.',
        runtime: 'Az alkalmazás hibába ütközött. Frissítsd az oldalt.',
        default: 'Váratlan hiba történt. Próbáld újra.',
      },
      en: {
        auth: 'Authentication failed. Please sign in again.',
        network: 'Network error. Please check your connection.',
        llm: 'The AI could not respond. Please try again.',
        speech: 'A speech recognition error occurred.',
        context: 'Could not load your data. Please refresh the page.',
        notif: 'Notification error.',
        runtime: 'The app encountered an error. Please refresh the page.',
        default: 'Something went wrong. Please try again.',
      },
    };
    const messages = dictionary[lang] || dictionary.en;
    return messages[category] || messages.default;
  },
};

export default logger;