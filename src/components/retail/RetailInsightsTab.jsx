import React from 'react';
import { BarChart2, Loader2 } from 'lucide-react';

export default function RetailInsightsTab({ aiLoading, productsCount, aiInsight, onGenerate }) {
  return (
    <div className="space-y-4">
      <button
        onClick={onGenerate}
        disabled={aiLoading || productsCount === 0}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-primary text-white font-semibold text-sm disabled:opacity-50"
      >
        {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <BarChart2 size={14} />}
        {aiLoading ? 'Elemzés folyamatban...' : 'AI Retail Elemzés generálása'}
      </button>
      {aiInsight && (
        <div className="bg-card border border-orange-500/30 rounded-2xl p-4">
          <p className="text-xs font-semibold text-orange-400 mb-3">🤖 AI Retail Elemzés</p>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{aiInsight}</p>
        </div>
      )}
    </div>
  );
}