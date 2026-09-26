import { AlertTriangle, PoundSterling, Wrench } from 'lucide-react';
import { estimateObd2Repair } from '@/lib/obd2RepairEstimator';

export default function RepairCostEstimator({ session, vehicle }) {
  const estimate = estimateObd2Repair(session, vehicle);

  if (!estimate.hasCodes) {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
        <p className="text-sm font-semibold text-green-400">Javítási becslés</p>
        <p className="mt-1 text-xs text-muted-foreground">Nincs beolvasott hibakód, ezért nincs várható alkatrészigény.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 space-y-3">
      <div className="flex items-start gap-2">
        <PoundSterling size={16} className="mt-0.5 text-yellow-400" />
        <div>
          <p className="text-sm font-semibold text-yellow-400">Várható javítási költség</p>
          <p className="text-2xl font-bold text-foreground">£{estimate.totalLow}–£{estimate.totalHigh}</p>
          {vehicle && <p className="text-xs text-muted-foreground">{vehicle.make} {vehicle.model} ({vehicle.year}) alapján</p>}
        </div>
      </div>

      <div className="rounded-md bg-card/70 border border-border p-2">
        <p className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
          <Wrench size={12} /> Várható alkatrészek
        </p>
        <div className="flex flex-wrap gap-1.5">
          {estimate.parts.map((part) => (
            <span key={part} className="rounded-full bg-secondary px-2 py-1 text-[11px] text-muted-foreground">{part}</span>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        {estimate.items.map((item) => (
          <div key={item.code} className="flex items-center justify-between rounded-md bg-card/70 border border-border px-2 py-2">
            <div>
              <p className="text-xs font-mono text-foreground">{item.code}</p>
              <p className="text-[11px] text-muted-foreground">{item.issue}</p>
            </div>
            <p className="text-xs font-semibold text-foreground">£{item.low}–£{item.high}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground flex gap-1.5 leading-relaxed">
        <AlertTriangle size={12} className="mt-0.5 shrink-0 text-yellow-400" />
        {estimate.note}
      </p>
    </div>
  );
}