import { TrendingUp, TrendingDown, Building2, Users, FolderOpen, DollarSign } from 'lucide-react';

export default function HoldingOverview({ businesses, projects, employees, clients }) {
  const totalRevenue = businesses.reduce((s, b) => s + (b.revenue_monthly || 0), 0);
  const totalExpense = businesses.reduce((s, b) => s + (b.expense_monthly || 0), 0);
  const totalProfit = totalRevenue - totalExpense;
  const activeBusinesses = businesses.filter(b => b.status === 'aktiv').length;
  const activeProjects = projects.filter(p => p.status === 'folyamatban').length;
  const totalEmployees = employees.filter(e => e.status === 'aktiv').length;
  const totalClients = clients.filter(c => c.status === 'aktiv').length;

  const stats = [
    { label: 'Havi bevétel', value: `£${totalRevenue.toLocaleString()}`, icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-400/10' },
    { label: 'Havi kiadás', value: `£${totalExpense.toLocaleString()}`, icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-400/10' },
    { label: 'Nettó profit', value: `£${totalProfit.toLocaleString()}`, icon: DollarSign, color: totalProfit >= 0 ? 'text-primary' : 'text-red-400', bg: totalProfit >= 0 ? 'bg-primary/10' : 'bg-red-400/10' },
    { label: 'Aktív cégek', value: activeBusinesses, icon: Building2, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { label: 'Projektek', value: activeProjects, icon: FolderOpen, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
    { label: 'Munkatársak', value: totalEmployees, icon: Users, color: 'text-purple-400', bg: 'bg-purple-400/10' },
  ];

  return (
    <div className="space-y-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-card border border-border rounded-2xl p-4">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-2`}>
              <Icon size={17} className={color} />
            </div>
            <p className="text-xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Profit margin bar */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs font-semibold text-foreground">Holding profit margin</p>
          <p className="text-xs text-muted-foreground">
            {totalRevenue > 0 ? `${((totalProfit / totalRevenue) * 100).toFixed(1)}%` : '—'}
          </p>
        </div>
        <div className="w-full bg-secondary rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${totalProfit >= 0 ? 'bg-primary' : 'bg-red-400'}`}
            style={{ width: `${totalRevenue > 0 ? Math.min(100, Math.max(0, (totalProfit / totalRevenue) * 100)) : 0}%` }}
          />
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-xs text-muted-foreground">{activeBusinesses} cég · {totalClients} ügyfél</span>
          <span className="text-xs text-muted-foreground">{activeProjects} aktív projekt</span>
        </div>
      </div>
    </div>
  );
}