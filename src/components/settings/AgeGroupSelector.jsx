import React from 'react';

const options = [
  { value: 'gyerek', label: 'Gyerek' },
  { value: 'tini', label: 'Tini' },
  { value: 'felnott', label: 'Felnőtt' },
  { value: 'idosebb', label: 'Idősebb' },
];

export default function AgeGroupSelector({ value, onChange }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-2">Korosztály</p>
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