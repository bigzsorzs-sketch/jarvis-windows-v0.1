import { BellRing, CheckCircle2, MapPin, Route } from 'lucide-react';
import { motion } from 'framer-motion';

const iconMap = {
  route: Route,
  stop: MapPin,
  task: CheckCircle2,
};

export default function IntelligentReminderPanel({ suggestions = [], onSelect }) {
  if (!suggestions.length) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <BellRing size={14} className="text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Intelligens emlékeztetők</p>
      </div>
      <div className="space-y-2">
        {suggestions.map((suggestion, index) => {
          const Icon = iconMap[suggestion.type] || BellRing;
          return (
            <motion.button
              key={`${suggestion.type}-${index}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onSelect?.(suggestion)}
              className="w-full rounded-2xl border border-primary/20 bg-primary/5 p-4 text-left active:scale-[0.99] transition-transform"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon size={17} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{suggestion.title}</p>
                    <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">{suggestion.confidence}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{suggestion.description}</p>
                  <span className="inline-flex mt-3 text-xs font-semibold text-primary">{suggestion.actionLabel}</span>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}