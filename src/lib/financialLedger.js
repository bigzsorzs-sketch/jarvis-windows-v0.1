import { localDateKey } from './localDate';

export function currentPeriod() { return localDateKey().slice(0, 7); }

export function ledgerSummary(entries = [], period = currentPeriod()) {
  const byBusiness = new Map();
  const totals = { income:0, expense:0, unassignedIncome:0, unassignedExpense:0, period };
  for (const entry of entries) {
    if (entry.category !== 'ceges' || !String(entry.date || '').startsWith(period + '-')) continue;
    const day = new Date(entry.date + 'T12:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== entry.date) throw new Error('LEDGER_DATE_INVALID');
    if (entry.currency && entry.currency !== 'GBP') throw new Error('LEDGER_CURRENCY_UNSUPPORTED');
    const minor = Math.round(Number(entry.amount) * 100);
    if (!Number.isSafeInteger(minor) || minor < 0 || Math.abs(Number(entry.amount) * 100 - minor) > 0.00001 || !['income', 'expense'].includes(entry.type)) throw new Error('LEDGER_ENTRY_INVALID');
    if (entry.amount_minor != null && entry.amount_minor !== minor) throw new Error('LEDGER_AMOUNT_MISMATCH');
    totals[entry.type] += minor;
    if (!Number.isSafeInteger(totals[entry.type])) throw new Error('LEDGER_TOTAL_TOO_LARGE');
    const businessId = entry.business_id || null;
    const row = byBusiness.get(businessId) || { income:0, expense:0 };
    row[entry.type] += minor;
    byBusiness.set(businessId, row);
    if (!businessId) totals[entry.type === 'income' ? 'unassignedIncome' : 'unassignedExpense'] += minor;
  }
  return { ...Object.fromEntries(Object.entries(totals).map(([k,v]) => [k, typeof v === 'number' ? v / 100 : v])), byBusiness };
}

export function businessesWithLedger(businesses = [], entries = [], period = currentPeriod()) {
  const summary = ledgerSummary(entries, period);
  return businesses.map(business => {
    const row = summary.byBusiness.get(business.id) || { income:0, expense:0 };
    return { ...business, reported_revenue_monthly:business.revenue_monthly, reported_expense_monthly:business.expense_monthly,
      revenue_monthly:row.income / 100, expense_monthly:row.expense / 100, financial_period:period, financial_source:'ledger' };
  });
}
