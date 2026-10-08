import { useState, useEffect } from 'react';
import { loadEcosystemData, analyzeEcosystem } from '@/lib/ecosystemEngine';
import { invokeWithRetry } from '@/lib/llmGateway';
import normalizeAssistantReply from '@/lib/normalizeAssistantReply';
import { Loader2, Zap, AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';


const PRIORITY_STYLE = {
  high: 'border-red-500/40 bg-red-500/5',
  medium: 'border-yellow-500/40 bg-yellow-500/5',
  low: 'border-primary/30 bg-primary/5',
};

const SEVERITY_STYLE = {
  critical: 'text-red-400',
  warning: 'text-yellow-400',
  info: 'text-blue-400',
};

function ScoreRing({ score }) {
  const color = score >= 75 ? '#3ecf8e' : score >= 50 ? '#facc15' : '#f87171';
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="hsl(220 15% 18%)" strokeWidth="8" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-foreground">{score}</span>
        <span className="text-[10px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

export default function EcosystemOptimizer() {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiInsight, setAiInsight] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const runAnalysis = async () => {
    setLoading(true);
    const data = await loadEcosystemData();
    const result = analyzeEcosystem(data);
    setAnalysis(result);
    setLoading(false);
  };

  useEffect(() => { runAnalysis(); }, []);

  const getAiInsight = async () => {
    if (!analysis) return;
    setAiLoading(true);
    const prompt = `Te egy üzleti ökoszisztéma-optimalizáló AI vagy. Elemezd ezt az adatot és adj 3-4 mondatos, konkrét, azonnal végrehajtható tanácsot:

Ecosystem Score: ${analysis.score}/100
Havi bevétel: £${analysis.totalRevenue.toFixed(0)} | Nettó profit: £${analysis.netProfit.toFixed(0)} | Profitráta: ${analysis.margin.toFixed(1)}%
Aktív projektek: ${analysis.activeProjects} | Lejárt: ${analysis.overdueProjects}
Kintlévőség: £${analysis.unpaidTotal.toFixed(0)}
Ineffektivitások: ${analysis.inefficiencies.map(i => i.message).join('; ')}
Javaslatok: ${analysis.recommendations.map(r => r.title).join(', ')}

Adj rövid, cselekvésre ösztönző elemzést magyarul. Legyél konkrét és döntésorientált.`;

    try {
      const result = await invokeWithRetry({ prompt, model: 'claude_sonnet_4_6' });
      setAiInsight(normalizeAssistantReply(result));
    } catch {
      setAiInsight('Az AI-elemzés most nem sikerült. Próbáld újra.');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 size={24} className="text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Ökoszisztéma elemzés folyamatban...</p>
      </div>
    );
  }

  if (!analysis) return null;

  const visibleInefficiencies = showAll ? analysis.inefficiencies : analysis.inefficiencies.slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Score + summary */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center gap-4">
          <ScoreRing score={analysis.score} />
          <div className="flex-1">
            <p className="text-base font-bold text-foreground mb-1">Ecosystem Score</p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Havi bevétel</span>
                <span className="text-foreground font-medium">£{analysis.totalRevenue.toFixed(0)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Nettó profit</span>
                <span className={`font-medium ${analysis.netProfit >= 0 ? 'text-primary' : 'text-red-400'}`}>
                  £{analysis.netProfit.toFixed(0)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Profitráta</span>
                <span className={`font-medium ${analysis.margin >= 30 ? 'text-primary' : analysis.margin >= 15 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {analysis.margin.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Kintlévőség</span>
                <span className={`font-medium ${analysis.unpaidTotal > 0 ? 'text-yellow-400' : 'text-primary'}`}>
                  £{analysis.unpaidTotal.toFixed(0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <button onClick={runAnalysis}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-secondary text-muted-foreground text-xs font-medium hover:text-foreground transition-colors">
          <RefreshCw size={12} /> Frissítés
        </button>
      </div>

      {/* Revenue by business */}
      {analysis.revenueByBiz.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Bevétel megoszlás</p>
          <div className="space-y-2.5">
            {analysis.revenueByBiz.filter(b => b.revenue > 0 || b.expense > 0).map(b => (
              <div key={b.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground font-medium truncate max-w-[140px]">{b.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${b.profit >= 0 ? 'text-primary' : 'text-red-400'}`}>
                      £{b.profit.toFixed(0)}
                    </span>
                    <span className="text-xs text-muted-foreground">{b.share.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${b.margin >= 20 ? 'bg-primary' : b.margin >= 0 ? 'bg-yellow-400' : 'bg-red-400'}`}
                    style={{ width: `${Math.max(2, b.share)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inefficiencies */}
      {analysis.inefficiencies.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Ineffektivitások ({analysis.inefficiencies.length})
          </p>
          <div className="space-y-2">
            {visibleInefficiencies.map((ineff, i) => (
              <div key={i} className="flex items-start gap-2.5 py-2 border-b border-border/50 last:border-0">
                <AlertTriangle size={13} className={`shrink-0 mt-0.5 ${SEVERITY_STYLE[ineff.severity] || 'text-muted-foreground'}`} />
                <p className="text-xs text-foreground leading-relaxed">{ineff.message}</p>
              </div>
            ))}
          </div>
          {analysis.inefficiencies.length > 3 && (
            <button onClick={() => setShowAll(s => !s)}
              className="mt-2 flex items-center gap-1 text-xs text-primary">
              {showAll ? <><ChevronUp size={12} /> Kevesebb</> : <><ChevronDown size={12} /> +{analysis.inefficiencies.length - 3} további</>}
            </button>
          )}
        </div>
      )}

      {/* Recommendations */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Optimalizálási javaslatok
        </p>
        <div className="space-y-2">
          {analysis.recommendations.map((rec, i) => (
            <div key={i} className={`border rounded-xl p-3 ${PRIORITY_STYLE[rec.priority]}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{rec.icon}</span>
                <p className="text-xs font-semibold text-foreground">{rec.title}</p>
                <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  rec.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                  rec.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-primary/20 text-primary'
                }`}>
                  {rec.priority === 'high' ? 'Sürgős' : rec.priority === 'medium' ? 'Közepes' : 'Alacsony'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{rec.action}</p>
            </div>
          ))}
        </div>
      </div>

      {/* AI deep insight */}
      <div className="bg-card border border-primary/30 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={15} className="text-primary" />
          <p className="text-sm font-semibold text-foreground">AI Stratégiai Elemzés</p>
        </div>
        {aiInsight ? (
          <p className="text-sm text-foreground leading-relaxed">{aiInsight}</p>
        ) : (
          <p className="text-xs text-muted-foreground mb-3">Kérj mélyebb AI-elemzést az ökoszisztémádról – konkrét stratégiai tanácsokkal.</p>
        )}
        <button onClick={getAiInsight} disabled={aiLoading}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
          {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {aiLoading ? 'Elemzés...' : aiInsight ? 'Újra elemzés' : 'AI Stratégiai tanács'}
        </button>
      </div>
    </div>
  );
}
