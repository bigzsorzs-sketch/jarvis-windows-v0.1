import { useMemo, useState } from 'react';
import { ClipboardList, Save, Loader2, Check } from 'lucide-react';

export default function RetailStocktakeTab({ products = [], onUpdateStock }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products]
  );

  const getValue = (product) => {
    const draftValue = drafts[product.id];
    return draftValue ?? String(product.stock || 0);
  };

  const handleSave = async (product) => {
    const nextValue = parseInt(drafts[product.id] ?? product.stock ?? 0, 10);
    setSavingId(product.id);
    await onUpdateStock(product.id, Number.isNaN(nextValue) ? 0 : nextValue);
    setSavingId(null);
    setSavedId(product.id);
    setTimeout(() => setSavedId((current) => (current === product.id ? null : current)), 1200);
  };

  if (sortedProducts.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center">
        <p className="text-sm font-medium text-foreground">Még nincs leltározható termék</p>
        <p className="text-xs text-muted-foreground mt-1">Először adj hozzá termékeket a készlethez.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <ClipboardList size={18} className="text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Leltározó nézet</p>
          <p className="text-xs text-muted-foreground mt-1">Menj végig a listán, írd át a fizikai készletet, és mentsd el termékenként azonnali szinkronnal.</p>
        </div>
      </div>

      {sortedProducts.map((product) => (
        <div key={product.id} className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{product.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {product.category || 'Nincs kategória'}{product.sku ? ` · ${product.sku}` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">Jelenlegi rendszer készlet</p>
              <p className="text-base font-bold text-primary">{product.stock || 0} db</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input
              type="number"
              min="0"
              value={getValue(product)}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [product.id]: e.target.value }))}
              className="flex-1 bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
              placeholder="Fizikai készlet"
            />
            <button
              onClick={() => handleSave(product)}
              disabled={savingId === product.id}
              className="sm:w-auto w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
            >
              {savingId === product.id ? <Loader2 size={14} className="animate-spin" /> : savedId === product.id ? <Check size={14} /> : <Save size={14} />}
              {savingId === product.id ? 'Mentés...' : savedId === product.id ? 'Mentve' : 'Készlet mentése'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}