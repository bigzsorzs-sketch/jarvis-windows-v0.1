import React from 'react';
import { useLang } from '@/lib/i18n';

export default function RetailTabs({ tab, setTab }) {
  const { t } = useLang();
  const tabs = [['inventory', '📦 ' + t('retail_inventory')], ['stocktake', '📝 ' + t('retail_stocktake')], ['restock', '🛒 ' + t('retail_restock')], ['sales', '💳 ' + t('retail_sales')], ['insights', '🤖 ' + t('retail_insights')]];

  return (
    <div className="flex gap-2">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          data-retail-tab={key}
          aria-pressed={tab === key}
          onClick={() => setTab(key)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${tab === key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
