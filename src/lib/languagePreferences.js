// The renderer preference and native preference are persisted in the same order.
// A delayed startup read must never undo a later user selection.
export function createLanguagePreferences({ languages, storage, bridge, onChange = () => {}, onStatus = () => {} }) {
  const valid = code => typeof code === 'string' && languages.some(item => item.code === code);
  let stored = null;
  try { stored = storage?.getItem('app_lang'); } catch {}
  let current = valid(stored) ? stored : 'hu';
  const hasValidStored = valid(stored);
  let revision = 0;
  let queue = Promise.resolve();

  const saveLocal = code => {
    try { if (!storage) return false; storage.setItem('app_lang', code); return true; } catch { return false; }
  };
  return {
    get current() { return current; },
    setListeners(listeners = {}) {
      onChange = listeners.onChange || (() => {});
      onStatus = listeners.onStatus || (() => {});
    },
    async hydrate() {
      const startedAt = revision;
      try {
        const settings = await bridge?.getSettings?.();
        if (startedAt === revision && !hasValidStored && valid(settings?.language)) {
          current = settings.language;
          saveLocal(current);
          onChange(current);
        }
      } catch {}
      return current;
    },
    select(code) {
      if (!valid(code)) return Promise.resolve({ success:false, code:'INVALID_LANGUAGE' });
      current = code;
      const selectedAt = ++revision;
      onChange(code);
      const localSaved = saveLocal(code);
      onStatus({ pending:Boolean(bridge?.saveSettings), error:!localSaved && !bridge?.saveSettings });
      const save = queue.then(async () => {
        let success = localSaved;
        if (bridge?.saveSettings) {
          try { await bridge.saveSettings({ language:code }); success = true; }
          catch { success = false; }
        }
        if (selectedAt === revision) onStatus({ pending:false, error:!success });
        return { success, language:code };
      });
      // select() always settles: clicking a menu must not emit an unhandled
      // rejection, and one failed write must not poison subsequent writes.
      queue = save.catch(() => {});
      return save;
    },
  };
}

export function localeForLanguage(code, languages) {
  return languages.find(item => item.code === code)?.speechCode || 'en-GB';
}

export function languageDirection(code) {
  return ['ar', 'he', 'fa'].includes(code) ? 'rtl' : 'ltr';
}
