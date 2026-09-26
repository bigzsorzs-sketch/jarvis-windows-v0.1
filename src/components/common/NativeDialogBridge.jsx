import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const text = {
  ok: { hu: 'Rendben', en: 'OK' },
  dismiss: { hu: 'Bezárás', en: 'Dismiss' },
};

function getLang() {
  if (typeof navigator === 'undefined') return 'en';
  return navigator.language?.toLowerCase().startsWith('hu') ? 'hu' : 'en';
}

export default function NativeDialogBridge() {
  const [dialog, setDialog] = useState(null);
  const lang = getLang();

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const originalAlert = window.alert;
    const originalConfirm = window.confirm;
    const originalPrompt = window.prompt;

    window.alert = (message = '') => {
      setDialog({ type: 'alert', message: String(message || '') });
    };

    window.confirm = (message = '') => {
      setDialog({ type: 'confirm', message: String(message || '') });
      return false;
    };

    window.prompt = (message = '') => {
      setDialog({ type: 'prompt', message: String(message || '') });
      return null;
    };

    return () => {
      window.alert = originalAlert;
      window.confirm = originalConfirm;
      window.prompt = originalPrompt;
    };
  }, []);

  return (
    <AnimatePresence>
      {dialog && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={dialog.message || text.dismiss[lang]}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          onClick={() => setDialog(null)}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 text-center shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-sm leading-relaxed text-foreground">{dialog.message}</p>
            <button
              type="button"
              aria-label={text.dismiss[lang]}
              onClick={() => setDialog(null)}
              className="mt-5 min-h-[44px] w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary"
            >
              {dialog.type === 'alert' ? text.ok[lang] : text.dismiss[lang]}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}