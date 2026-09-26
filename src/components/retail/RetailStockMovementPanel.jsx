import React from 'react';
import { ScanLine, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

export default function RetailStockMovementPanel({
  barcode,
  setBarcode,
  quantity,
  setQuantity,
  matchedProduct,
  onStockIn,
  onStockOut,
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3 mb-4">
      <div className="flex items-center gap-2">
        <ScanLine size={16} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Barcode készletkezelés</h3>
      </div>

      <input
        value={barcode}
        onChange={(e) => setBarcode(e.target.value)}
        placeholder="Barcode / SKU beolvasva vagy beírva"
        className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
      />

      <input
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        type="number"
        min="1"
        placeholder="Mennyiség"
        className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
      />

      {matchedProduct ? (
        <div className="bg-secondary rounded-xl p-3 text-xs text-muted-foreground">
          <p className="text-sm font-medium text-foreground">{matchedProduct.name}</p>
          <p>SKU: {matchedProduct.sku || 'nincs'} · Készlet: {matchedProduct.stock || 0} db</p>
        </div>
      ) : barcode ? (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-xs text-yellow-400">
          Nem találtunk terméket ehhez a barcode / SKU kódhoz.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onStockIn}
          disabled={!matchedProduct}
          className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          <ArrowDownToLine size={14} /> Beérkező áru
        </button>
        <button
          onClick={onStockOut}
          disabled={!matchedProduct}
          className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-orange-500 text-white text-sm font-semibold disabled:opacity-50"
        >
          <ArrowUpFromLine size={14} /> Kimenő áru
        </button>
      </div>
    </div>
  );
}