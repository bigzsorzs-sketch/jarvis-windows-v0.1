import { Trash2 } from 'lucide-react';

function consumption(log) {
  return Number(log.distance_km) > 0 ? ((Number(log.liters || 0) / Number(log.distance_km)) * 100).toFixed(1) : '0.0';
}

export default function FuelLogList({ logs, vehiclesById, onDelete }) {
  if (logs.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground text-sm">
        Még nincs rögzített tankolás.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">Tankolási napló</h2>
      {logs.map((log) => {
        const vehicle = vehiclesById[log.vehicle_id];
        return (
          <div key={log.id} className="bg-card border border-border rounded-2xl p-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {new Date(log.date).toLocaleDateString('hu-HU')} · {consumption(log)} L/100km
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {log.liters} L · {Number(log.total_cost || 0).toLocaleString('hu-HU')} Ft · {log.distance_km} km
              </p>
              {vehicle && <p className="text-xs text-muted-foreground mt-1">{vehicle.make} {vehicle.model}</p>}
            </div>
            <button onClick={() => onDelete(log.id)} className="h-9 w-9 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center shrink-0">
              <Trash2 size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}