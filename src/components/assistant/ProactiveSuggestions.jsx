import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { useLang } from '@/lib/i18n';

export default function ProactiveSuggestions({ suggestions, onSelect }) {
  const { t } = useLang();
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-4 pb-2"
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Zap size={11} className="text-primary" />
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{t('suggested_actions')}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s.prompt)}
            className="px-3 py-1.5 rounded-full bg-secondary border border-border text-xs text-foreground hover:bg-muted transition-all"
          >
            {s.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}