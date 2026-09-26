import React from 'react';
import { ShoppingBag, Plus } from 'lucide-react';

export default function RetailHeader({ productsCount, todayRevenue, onAddSale, onAddProduct }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-2xl bg-orange-500/20 flex items-center justify-center">
        <ShoppingBag size={20} className="text-orange-400" />
      </div>
      <div className="flex-1">
        <h1 className="text-xl font-bold text-foreground">Retail Manager</h1>
        <p className="text-xs text-muted-foreground">{productsCount} termék · Ma: £{todayRevenue.toFixed(0)} bevétel</p>
      </div>
      <div className="flex gap-2">
        <button onClick={onAddSale} className="px-3 py-1.5 rounded-xl bg-orange-500/20 text-orange-400 text-xs font-semibold border border-orange-500/30">
          + Eladás
        </button>
        <button onClick={onAddProduct} className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <Plus size={14} className="text-primary-foreground" />
        </button>
      </div>
    </div>
  );
}