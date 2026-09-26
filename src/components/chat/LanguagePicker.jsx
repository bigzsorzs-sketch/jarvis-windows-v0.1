import { useState, useRef, useEffect, memo } from 'react';
import { useLang } from '@/lib/i18n';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';

const LanguagePicker = memo(function LanguagePicker() {
  const { lang, changeLang, t, SUPPORTED_LANGUAGES } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current = SUPPORTED_LANGUAGES.find(l => l.code === lang) || SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-xl leading-none hover:scale-110 transition-transform active:scale-95"
        title={current.name}
      >
        {current.flag}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-9 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden min-w-[200px]"
          >
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-4 pt-3 pb-1 sticky top-0 bg-card">
              {t('language')}
            </p>
            <div className="overflow-y-auto max-h-[60vh]">
              {SUPPORTED_LANGUAGES.map(({ code, name, flag }) => (
                <button
                  key={code}
                  onClick={() => { changeLang(code); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-secondary transition-colors ${
                    lang === code ? 'text-primary bg-primary/5' : 'text-foreground'
                  }`}
                >
                  <span className="text-lg">{flag}</span>
                  <span className="flex-1 text-left">{name}</span>
                  {lang === code && <Check size={13} className="text-primary shrink-0" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default LanguagePicker;