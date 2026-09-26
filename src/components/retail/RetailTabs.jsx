import React from 'react';

export default function RetailTabs({ tab, setTab }) {
  const tabs = [['inventory', '📦 Készlet'], ['stocktake', '📝 Leltár'], ['restock', '🛒 Beszerzés'], ['sales', '💳 Eladások'], ['insights', '🤖 AI Elemzés']];

  return (
    <div className="flex gap-2">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          onClick={() => setTab(key)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${tab === key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}