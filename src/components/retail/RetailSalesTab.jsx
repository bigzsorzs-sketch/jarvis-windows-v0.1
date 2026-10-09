import React from 'react';
import { TrendingUp } from 'lucide-react';

export default function RetailSalesTab({ sales, onVoid }) {
  if (sales.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <TrendingUp size={40} className="mx-auto mb-3 opacity-20" />
        <p className="text-sm">Még nincs értékesítés rögzítve.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sales.slice(0, 30).map((s) => (
        <div key={s.id} className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">{s.product_name}</p>
            <p className="text-xs text-muted-foreground">{s.quantity} db · {s.date}{s.discount > 0 ? ` · -${s.discount}%` : ''}</p>
            {s.status === 'voided' && <p className="text-xs text-orange-400">Visszáru rögzítve: {s.voided_date}</p>}
            {s.status === 'completed' && onVoid && <button onClick={() => onVoid(s)} className="text-xs text-orange-400 mt-1">Visszáru és visszatérítés</button>}
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-primary">£{s.revenue?.toFixed(2)}</p>
            <p className="text-xs text-green-400">+£{s.profit?.toFixed(2)} profit</p>
          </div>
        </div>
      ))}
    </div>
  );
}
