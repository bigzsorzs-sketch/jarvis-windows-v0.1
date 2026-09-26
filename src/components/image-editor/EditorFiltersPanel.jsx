import { memo, useState } from 'react';
import { Sliders } from 'lucide-react';

const FILTERS = [
  { id: 'grayscale', label: 'Szürkeárnyalatos' },
  { id: 'sepia', label: 'Szépia' },
  { id: 'invert', label: 'Invertált' },
  { id: 'blur', label: 'Elmosás', hasValue: true, min: 0, max: 20, default: 0, unit: 'px' },
  { id: 'brightness', label: 'Fényerő', hasValue: true, min: 0, max: 200, default: 100, unit: '%' },
  { id: 'contrast', label: 'Kontraszt', hasValue: true, min: 0, max: 200, default: 100, unit: '%' },
  { id: 'saturate', label: 'Telítettség', hasValue: true, min: 0, max: 300, default: 100, unit: '%' },
  { id: 'hue-rotate', label: 'Árnyalat forgatás', hasValue: true, min: 0, max: 360, default: 0, unit: 'deg' },
];

export default memo(function EditorFiltersPanel({ onApplyFilter }) {
  const [activeToggles, setActiveToggles] = useState({}); // for boolean filters
  const [sliderValues, setSliderValues] = useState(
    Object.fromEntries(FILTERS.filter(f => f.hasValue).map(f => [f.id, f.default]))
  );

  const handleToggle = (id) => {
    const next = !activeToggles[id];
    setActiveToggles(prev => ({ ...prev, [id]: next }));
    onApplyFilter(id, next ? 1 : 0);
  };

  const handleSlider = (id, value) => {
    setSliderValues(prev => ({ ...prev, [id]: value }));
    onApplyFilter(id, value);
  };

  const resetAll = () => {
    setActiveToggles({});
    const defaults = Object.fromEntries(FILTERS.filter(f => f.hasValue).map(f => [f.id, f.default]));
    setSliderValues(defaults);
    onApplyFilter('reset', 0);
  };

  return (
    <div className="w-52 bg-card border-l border-border flex flex-col shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Sliders size={13} className="text-primary" />
          <span className="text-xs font-semibold text-foreground">Szűrők</span>
        </div>
        <button onClick={resetAll} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">
          Visszaállít
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {FILTERS.map(f => (
          <div key={f.id}>
            {f.hasValue ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-foreground">{f.label}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {sliderValues[f.id]}{f.unit}
                  </span>
                </div>
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  value={sliderValues[f.id]}
                  onChange={e => handleSlider(f.id, +e.target.value)}
                  className="w-full accent-primary h-1"
                />
              </div>
            ) : (
              <button
                onClick={() => handleToggle(f.id)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                  activeToggles[f.id]
                    ? 'bg-primary/15 text-primary border-primary/40'
                    : 'text-foreground border-border hover:bg-secondary'
                }`}
              >
                {f.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});