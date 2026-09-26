import React from 'react';
import { AlertTriangle, Search, Package } from 'lucide-react';

export default function RetailInventoryTab({ lowStock, search, setSearch, filtered }) {
  return (
    <div className="space-y-3">
      {lowStock.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-3 flex gap-2">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-yellow-400 mb-1">Alacsony készlet figyelmeztetés</p>
            <p className="text-xs text-foreground">{lowStock.map(p => `${p.name} (${p.stock} db)`).join(', ')}</p>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 bg-card border border-border rounded-2xl px-3 py-2.5">
        <Search size={14} className="text-muted-foreground" />
        <input
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          placeholder="Keresés..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Package size={40} className="mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">Adj hozzá termékeket!</p>
        </div>
      ) : (
        filtered.map((p) => (
          <div key={p.id} className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{p.name}</p>
                {p.category && <p className="text-xs text-muted-foreground">{p.category}{p.sku ? ` · ${p.sku}` : ''}</p>}
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-primary">£{p.price?.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Önköltség: £{p.cost?.toFixed(2)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${(p.stock || 0) <= (p.min_stock || 5) ? 'bg-yellow-500/20 text-yellow-400' : 'bg-primary/10 text-primary'}`}>
                <Package size={11} />
                {p.stock || 0} db raktáron
              </div>
              <p className="text-xs text-muted-foreground">
                Margin: {p.price > 0 ? (((p.price - p.cost) / p.price) * 100).toFixed(0) : 0}%
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}