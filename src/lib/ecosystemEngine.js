import { jarvis } from '@/api/jarvisClient';
import { businessesWithLedger, ledgerSummary } from './financialLedger';

/**
 * Ecosystem Optimization Engine
 * Elemzi a teljes üzleti és személyes ökoszisztémát, és használható javaslatokat ad.
 */

export async function loadEcosystemData() {
  const currentUser = await jarvis.auth.me().catch(() => null);
  if (!currentUser?.email) throw new Error('A felhasználó nincs bejelentkezve.');
  const uf = { created_by: currentUser.email };

  const [businesses, projects, employees, clients, invoices, todos, finance, reminders, meds] = await Promise.all([
    jarvis.entities.Business.filter(uf),
    jarvis.entities.BusinessProject.filter(uf),
    jarvis.entities.Employee.filter(uf),
    jarvis.entities.BusinessClient.filter(uf),
    jarvis.entities.Invoice.filter(uf, '-created_date'),
    jarvis.entities.TodoItem.filter({ ...uf, is_completed: false }),
    jarvis.entities.FinanceEntry.filter(uf, '-date'),
    jarvis.entities.Reminder.filter({ ...uf, is_done: false }),
    jarvis.entities.Medication.filter({ ...uf, is_active: true }),
  ]);
  return { businesses, projects, employees, clients, invoices, todos, finance, reminders, meds };
}

export function analyzeEcosystem(data) {
  const { projects, employees, clients, invoices, todos, finance, reminders } = data;
  const businesses = businessesWithLedger(data.businesses, finance, data.financialPeriod);
  const ledger = ledgerSummary(finance, data.financialPeriod);

  // ── REVENUE ANALYSIS ──
  const totalRevenue = ledger.income;
  const totalExpense = ledger.expense;
  const netProfit = totalRevenue - totalExpense;
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Revenue distribution – detect concentration risk
  const revenueByBiz = businesses.map(b => ({
    id: b.id,
    name: b.name,
    revenue: b.revenue_monthly || 0,
    expense: b.expense_monthly || 0,
    profit: (b.revenue_monthly || 0) - (b.expense_monthly || 0),
    share: totalRevenue > 0 ? ((b.revenue_monthly || 0) / totalRevenue) * 100 : 0,
    margin: (b.revenue_monthly || 0) > 0
      ? (((b.revenue_monthly || 0) - (b.expense_monthly || 0)) / (b.revenue_monthly || 0)) * 100
      : 0,
  })).sort((a, b) => b.revenue - a.revenue);

  // ── WORKLOAD ANALYSIS ──
  const projectsByBiz = {};
  projects.forEach(p => {
    if (!projectsByBiz[p.business_id]) projectsByBiz[p.business_id] = [];
    projectsByBiz[p.business_id].push(p);
  });

  const activeProjects = projects.filter(p => p.status === 'folyamatban');
  const overdueProjects = projects.filter(p => {
    if (!p.end_date || p.status === 'kesz' || p.status === 'megszakitva') return false;
    return new Date(p.end_date) < new Date();
  });

  const employeesByBiz = {};
  employees.forEach(e => {
    if (!employeesByBiz[e.business_id]) employeesByBiz[e.business_id] = [];
    employeesByBiz[e.business_id].push(e);
  });

  // Workload per employee: active projects / employee count
  const workloadByBiz = businesses.map(b => {
    const bProjects = (projectsByBiz[b.id] || []).filter(p => p.status === 'folyamatban');
    const bEmployees = (employeesByBiz[b.id] || []).filter(e => e.status === 'aktiv');
    const ratio = bEmployees.length > 0 ? bProjects.length / bEmployees.length : bProjects.length;
    return { id: b.id, name: b.name, projects: bProjects.length, employees: bEmployees.length, ratio };
  });

  // ── RESOURCE ANALYSIS ──
  const totalSalary = employees
    .filter(e => e.status === 'aktiv')
    .reduce((s, e) => s + (e.salary_monthly || 0), 0);

  const clientsByBiz = {};
  clients.forEach(c => {
    if (!clientsByBiz[c.business_id]) clientsByBiz[c.business_id] = [];
    clientsByBiz[c.business_id].push(c);
  });

  const unpaidInvoices = invoices.filter(i => i.status === 'kiallitva' || i.status === 'lejart');
  const unpaidTotal = unpaidInvoices.reduce((s, i) => s + (i.total_amount || 0), 0);

  // ── INEFFICIENCY DETECTION ──
  const inefficiencies = [];

  // Low-margin businesses
  revenueByBiz.forEach(b => {
    if (b.revenue > 0 && b.margin < 20) {
      inefficiencies.push({
        type: 'low_margin',
        severity: b.margin < 0 ? 'critical' : 'warning',
        business: b.name,
        message: `${b.name}: ${b.margin.toFixed(1)}% profitráta – optimalizáld a kiadásokat!`,
        value: b.margin,
      });
    }
  });

  // Overdue projects
  overdueProjects.forEach(p => {
    inefficiencies.push({
      type: 'overdue_project',
      severity: 'warning',
      business: businesses.find(b => b.id === p.business_id)?.name || '',
      message: `"${p.name}" projekt lejárt (határidő: ${p.end_date})`,
      value: p.end_date,
    });
  });

  // Revenue concentration risk
  if (revenueByBiz.length > 1 && revenueByBiz[0]?.share > 70) {
    inefficiencies.push({
      type: 'concentration_risk',
      severity: 'warning',
      business: revenueByBiz[0].name,
      message: `Bevétel-koncentráció: ${revenueByBiz[0].name} adja a bevétel ${revenueByBiz[0].share.toFixed(0)}%-át – diverzifikálj!`,
      value: revenueByBiz[0].share,
    });
  }

  // Overworked teams
  workloadByBiz.forEach(w => {
    if (w.ratio > 3) {
      inefficiencies.push({
        type: 'overloaded',
        severity: 'warning',
        business: w.name,
        message: `${w.name}: ${w.projects} aktív projekt / ${w.employees} alkalmazott – túlterhelt csapat!`,
        value: w.ratio,
      });
    }
  });

  // Unpaid invoices
  if (unpaidTotal > 0) {
    inefficiencies.push({
      type: 'unpaid_invoices',
      severity: unpaidTotal > 5000 ? 'critical' : 'info',
      business: 'Holding',
      message: `£${unpaidTotal.toFixed(0)} kintlévő számla – kövesd fel az ügyfeleket!`,
      value: unpaidTotal,
    });
  }

  // Understaffed businesses
  businesses.forEach(b => {
    const bProjects = (projectsByBiz[b.id] || []).filter(p => p.status === 'folyamatban');
    const bEmps = (employeesByBiz[b.id] || []).filter(e => e.status === 'aktiv');
    if (bProjects.length > 0 && bEmps.length === 0) {
      inefficiencies.push({
        type: 'no_staff',
        severity: 'critical',
        business: b.name,
        message: `${b.name}: aktív projektek alkalmazott nélkül – adj hozzá HR erőforrást!`,
        value: 0,
      });
    }
  });

  // ── OPTIMIZATION RECOMMENDATIONS ──
  const recommendations = generateRecommendations({
    revenueByBiz, workloadByBiz, inefficiencies,
    totalRevenue, netProfit, margin, unpaidTotal,
    activeProjects, overdueProjects, totalSalary,
  });

  // ── ECOSYSTEM SCORE ──
  let score = 100;
  inefficiencies.forEach(i => {
    if (i.severity === 'critical') score -= 15;
    else if (i.severity === 'warning') score -= 7;
    else score -= 2;
  });
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    financialPeriod:ledger.period,
    unassignedIncome:ledger.unassignedIncome,
    unassignedExpense:ledger.unassignedExpense,
    totalRevenue,
    totalExpense,
    netProfit,
    margin,
    revenueByBiz,
    workloadByBiz,
    inefficiencies,
    recommendations,
    unpaidTotal,
    totalSalary,
    activeProjects: activeProjects.length,
    overdueProjects: overdueProjects.length,
  };
}

function generateRecommendations({ revenueByBiz, workloadByBiz, inefficiencies, totalRevenue, netProfit, margin, unpaidTotal, activeProjects, overdueProjects, totalSalary }) {
  const recs = [];

  if (margin < 30 && totalRevenue > 0) {
    recs.push({
      priority: 'high',
      icon: '📉',
      title: 'Profitráta javítása',
      action: `Elemezd a ${revenueByBiz.find(b => b.margin === Math.min(...revenueByBiz.map(x => x.margin)))?.name || 'legrosszabb'} cég kiadásait – csökkentsd 10%-kal.`,
    });
  }

  if (unpaidTotal > 1000) {
    recs.push({
      priority: 'high',
      icon: '💳',
      title: 'Kintlévőség behajtása',
      action: `£${unpaidTotal.toFixed(0)} kintlévő számla – küldj emlékeztetőt az ügyfeleknek ezen a héten.`,
    });
  }

  const overloaded = workloadByBiz.filter(w => w.ratio > 2.5);
  if (overloaded.length > 0) {
    recs.push({
      priority: 'medium',
      icon: '⚖️',
      title: 'Munkaterhelés kiegyensúlyozása',
      action: `${overloaded.map(w => w.name).join(', ')} – csökkentsd az egyidejű projekteket vagy bővítsd a csapatot.`,
    });
  }

  if (overdueProjects > 0) {
    recs.push({
      priority: 'high',
      icon: '⏰',
      title: 'Lejárt projektek felülvizsgálata',
      action: `${overdueProjects} lejárt projekt – frissítsd a státuszokat vagy zárd le a projekteket.`,
    });
  }

  const positiveRevenueBusinesses = revenueByBiz.filter(b => b.revenue > 0);
  const lowestBiz = positiveRevenueBusinesses[positiveRevenueBusinesses.length - 1];  if (lowestBiz && revenueByBiz.length > 1) {
    recs.push({
      priority: 'medium',
      icon: '🚀',
      title: 'Alulteljesítő vállalkozás aktiválása',
      action: `${lowestBiz.name} a legkisebb bevételű – fontold meg egy növekedési terv kidolgozását.`,
    });
  }

  if (totalSalary > 0 && totalRevenue > 0 && (totalSalary / totalRevenue) > 0.6) {
    recs.push({
      priority: 'medium',
      icon: '👥',
      title: 'Bérköltség arány túl magas',
      action: `Bérköltség a bevétel ${((totalSalary / totalRevenue) * 100).toFixed(0)}%-a – automatizálj vagy optimalizálj.`,
    });
  }

  if (recs.length === 0) {
    recs.push({
      priority: 'low',
      icon: '✅',
      title: 'Az ökoszisztéma kiegyensúlyozott',
      action: 'Folytasd a jelenlegi stratégiát – nincs kritikus optimalizálási teendő.',
    });
  }

  return recs;
}

export function buildEcosystemContext(analysis) {
  if (!analysis) return '';
  const { score, totalRevenue, netProfit, margin, inefficiencies, activeProjects, overdueProjects, unpaidTotal } = analysis;
  return `
━━━ ECOSYSTEM STATUS ━━━
Ecosystem Score: ${score}/100
Total Monthly Revenue: £${totalRevenue.toFixed(0)} | Net Profit: £${netProfit.toFixed(0)} | Margin: ${margin.toFixed(1)}%
Active Projects: ${activeProjects} | Overdue: ${overdueProjects} | Unpaid Invoices: £${unpaidTotal.toFixed(0)}
Inefficiencies detected (${inefficiencies.length}): ${inefficiencies.map(i => i.message).join(' | ') || 'none'}
`;
}
