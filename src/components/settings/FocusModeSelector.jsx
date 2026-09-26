import React from 'react';
import { Zap } from 'lucide-react';

const options = [
  { value: 'altalanos', label: 'Általános' },
  { value: 'munka', label: 'Munka' },
  { value: 'tanulas', label: 'Tanulás' },
  { value: 'relax', label: 'Relax' },
];

export default function FocusModeSelector({ value, onChange }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-4 h-4 text-yellow-400" />
        <p className="text-sm font-semibold text-foreground">Fókusz mód</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              value === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}