import { ChevronRight, TrendingUp, TrendingDown, Users } from 'lucide-react';

const statusConfig = {
  aktiv: { label: 'Aktív', cls: 'bg-green-400/15 text-green-400' },
  inaktiv: { label: 'Inaktív', cls: 'bg-muted text-muted-foreground' },
  felfilggesztett: { label: 'Felfüggesztve', cls: 'bg-yellow-400/15 text-yellow-400' },
};

export default function BusinessCard({ business, employeeCount, projectCount, onClick }) {
  const profit = (business.revenue_monthly || 0) - (business.expense_monthly || 0);
  const st = statusConfig[business.status] || statusConfig.aktiv;

  return (
    <button
      onClick={onClick}
      className="w-full bg-card border border-border rounded-2xl p-4 text-left hover:bg-secondary/50 transition-all active:scale-[0.99]"
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl shrink-0">
          {business.logo_emoji || '🏢'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold text-foreground truncate">{business.name}</p>
            <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{business.industry || 'Nincs iparág'}</p>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1">
              <TrendingUp size={11} className="text-green-400" />
              <span className="text-xs text-foreground">£{(business.revenue_monthly || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <TrendingDown size={11} className="text-red-400" />
              <span className="text-xs text-foreground">£{(business.expense_monthly || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <Users size={11} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{employeeCount}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-xs font-bold ${profit >= 0 ? 'text-primary' : 'text-red-400'}`}>
            {profit >= 0 ? '+' : ''}£{profit.toLocaleString()}
          </span>
          <span className="text-[10px] text-muted-foreground">Pénzforgalmi egyenleg</span>
          <span className="text-xs text-muted-foreground">{projectCount} projekt</span>
          <ChevronRight size={14} className="text-muted-foreground mt-1" />
        </div>
      </div>
    </button>
  );
}
