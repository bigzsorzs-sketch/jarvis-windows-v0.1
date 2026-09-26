import { GripVertical, Maximize2, Minimize2, X } from 'lucide-react';
import OBD2Gauge from './OBD2Gauge';

export default function OBD2PidWidgetCard({ metric, value, size = 'normal', onToggleSize, onRemove, dragHandleProps }) {
  const isWide = size === 'wide';

  return (
    <div className={`relative bg-card border border-border rounded-2xl overflow-hidden ${isWide ? 'sm:col-span-2' : ''}`}>
      <div className="absolute left-2 top-2 z-10 flex items-center gap-1">
        <button
          type="button"
          {...dragHandleProps}
          className="h-8 w-8 rounded-lg bg-secondary/90 text-muted-foreground flex items-center justify-center cursor-grab active:cursor-grabbing"
          aria-label="Kártya húzása"
        >
          <GripVertical size={15} />
        </button>
      </div>
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
        <button
          type="button"
          onClick={() => onToggleSize(metric.id)}
          className="h-8 w-8 rounded-lg bg-secondary/90 text-muted-foreground flex items-center justify-center"
          aria-label="Kártya méretének váltása"
        >
          {isWide ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button
          type="button"
          onClick={() => onRemove(metric.id)}
          className="h-8 w-8 rounded-lg bg-red-500/15 text-red-300 flex items-center justify-center"
          aria-label="PID eltávolítása"
        >
          <X size={14} />
        </button>
      </div>
      <OBD2Gauge
        metric={metric.name}
        value={Number(value) || 0}
        min={metric.min}
        max={metric.max}
        unit={metric.unit}
        color={metric.color}
      />
      {metric.getStatus && (
        <div className="px-4 pb-4 -mt-2 text-center">
          <span className="inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
            {metric.getStatus(Number(value) || 0)}
          </span>
        </div>
      )}
    </div>
  );
}