import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '@/lib/i18n';

export default function TutorialOverlay({ tutorialId, steps, onComplete }) {
  const { t } = useLang();
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const seen = JSON.parse(localStorage.getItem('tutorialsSeen') || '{}');
    if (!seen[tutorialId]) {
      setShown(true);
    }
  }, [tutorialId]);

  const markComplete = () => {
    const seen = JSON.parse(localStorage.getItem('tutorialsSeen') || '{}');
    seen[tutorialId] = true;
    localStorage.setItem('tutorialsSeen', JSON.stringify(seen));
    setShown(false);
    onComplete?.();
  };

  if (!shown || !steps.length) return null;

  const current = steps[step];

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setShown(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-3xl p-6 max-w-sm w-full"
          >
            {/* Close button */}
            <button
              onClick={() => setShown(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-muted"
            >
              <X size={16} className="text-muted-foreground" />
            </button>

            {/* Icon + Title */}
            <div className="text-4xl mb-3">{current.icon}</div>
            <h2 className="text-lg font-bold text-foreground mb-2">{current.title}</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              {current.description}
            </p>

            {/* Visual hint (optional) */}
            {current.hint && (
              <div className="bg-secondary rounded-2xl p-4 mb-6 text-xs text-foreground">
                💡 {current.hint}
              </div>
            )}

            {/* Progress dots */}
            <div className="flex gap-1 mb-6">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-all ${
                    i === step ? 'bg-primary' : 'bg-border'
                  }`}
                />
              ))}
            </div>

            {/* Navigation buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setStep(Math.max(0, step - 1))}
                disabled={step === 0}
                className="flex-1 py-2.5 rounded-xl bg-secondary text-muted-foreground text-sm font-medium disabled:opacity-30 flex items-center justify-center gap-1"
              >
                <ChevronLeft size={14} /> {t('back')}
              </button>

              {step === steps.length - 1 ? (
                <button
                  onClick={markComplete}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1"
                >
                  <Check size={14} /> {t('done')}
                </button>
              ) : (
                <button
                  onClick={() => setStep(Math.min(steps.length - 1, step + 1))}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1"
                >
                  {t('onb_continue')} <ChevronRight size={14} />
                </button>
              )}
            </div>

            {/* Skip link */}
            <button
              onClick={markComplete}
              className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('cancel')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}