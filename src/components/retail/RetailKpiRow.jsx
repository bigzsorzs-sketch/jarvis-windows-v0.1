import React from 'react';

export default function RetailKpiRow({ totalRevenue, totalProfit, lowStockCount }) {
  const items = [
    { label: 'Bevétel', value: `£${totalRevenue.toFixed(0)}`, color: 'text-primary' },
    { label: 'Profit', value: `£${totalProfit.toFixed(0)}`, color: totalProfit >= 0 ? 'text-green-400' : 'text-red-400' },
    { label: 'Alacsony készlet', value: lowStockCount, color: lowStockCount > 0 ? 'text-yellow-400' : 'text-muted-foreground' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 mb-3">
      {items.map((kpi) => (
        <div key={kpi.label} className="bg-card border border-border rounded-xl p-2.5 text-center">
          <p className={`text-base font-bold ${kpi.color}`}>{kpi.value}</p>
          <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
        </div>
      ))}
    </div>
  );
}