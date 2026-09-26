import { Star } from 'lucide-react';

export default function FocusModeCard({ focusModes, activeMode, onSelect, t }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Star size={16} className="text-yellow-400" />
        <h2 className="text-sm font-semibold text-foreground">{t('focus_mode')}</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {focusModes.map(({ key, label }) => (
          <button key={key} onClick={() => onSelect({ focus_mode: key })} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeMode === key ? 'bg-secondary border border-primary text-foreground' : 'bg-secondary text-muted-foreground'}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}