import { jarvis } from '@/api/jarvisClient';

async function getCurrentUserOwnerFilter() {
  const currentUser = await jarvis.auth.me().catch(() => null);
  if (!currentUser?.email) throw new Error('auth_required');
  return { currentUser, ownerFilter: { created_by: currentUser.email } };
}

// Track suggestion accepted/ignored
export async function logBehavior(event, accepted, context = '', pattern_key = '') {
  const { currentUser } = await getCurrentUserOwnerFilter();
  await jarvis.entities.BehaviorLog.create({ event, accepted, context, pattern_key, created_by: currentUser.email }).catch(() => {});
}

// Compute acceptance rate for a pattern
export async function getPatternAcceptance(pattern_key) {
  const { ownerFilter } = await getCurrentUserOwnerFilter();
  const logs = await jarvis.entities.BehaviorLog.filter({ ...ownerFilter, pattern_key }).catch(() => []);
  if (!logs.length) return null;
  const accepted = logs.filter(l => l.accepted).length;
  return { rate: accepted / logs.length, total: logs.length };
}

// Detect repeated behavior patterns from ActionLog
export async function detectPatterns() {
  const { ownerFilter } = await getCurrentUserOwnerFilter();
  const logs = await jarvis.entities.ActionLog.filter(ownerFilter, '-created_date', 50).catch(() => []);
  const counts = {};
  for (const log of logs) {
    counts[log.action_type] = (counts[log.action_type] || 0) + 1;
  }
  // Return top 3 patterns
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => ({ type, count }));
}

// Build adaptive tone based on behavior history
export async function getAdaptiveTone(settings) {
  const patterns = await detectPatterns();
  const topAction = patterns[0]?.type;
  let tone = settings?.personality || 'kedves';

  // If user mostly uses health tools → more health-focused
  if (topAction === 'log_blood_sugar' || topAction === 'log_meal') {
    return { tone, focus: 'health', hint: 'A felhasználó főleg egészségügyi adatokat rögzít.' };
  }
  if (topAction === 'create_invoice' || topAction === 'log_finance') {
    return { tone, focus: 'finance', hint: 'A felhasználó főleg pénzügyi műveleteket végez.' };
  }
  if (topAction === 'create_task' || topAction === 'create_reminder') {
    return { tone, focus: 'productivity', hint: 'A felhasználó produktivitás-orientált.' };
  }
  return { tone, focus: 'general', hint: '' };
}

// Generate end-of-day routine summary
export async function generateDailySummary() {
  const today = new Date().toISOString().split('T')[0];
  const { ownerFilter } = await getCurrentUserOwnerFilter();
  const [todos, finance, bs, meals, actions] = await Promise.all([
    jarvis.entities.TodoItem.filter(ownerFilter, '-created_date', 20).catch(() => []),
    jarvis.entities.FinanceEntry.filter({ ...ownerFilter, date: today }).catch(() => []),
    jarvis.entities.BloodSugar.filter({ ...ownerFilter, date: today }).catch(() => []),
    jarvis.entities.MealLog.filter({ ...ownerFilter, date: today }).catch(() => []),
    jarvis.entities.ActionLog.filter(ownerFilter, '-created_date', 20).catch(() => []),
  ]);

  const pendingTodos = todos.filter(t => !t.is_completed).length;
  const completedTodos = todos.filter(t => t.is_completed).length;
  const todayCalories = meals.reduce((s, m) => s + (m.calories || 0), 0);
  const todayIncome = finance.filter(f => f.type === 'income').reduce((s, f) => s + f.amount, 0);
  const todayExpense = finance.filter(f => f.type === 'expense').reduce((s, f) => s + f.amount, 0);
  const todayActions = actions.filter(a => a.created_date?.startsWith(today)).length;

  return {
    pendingTodos, completedTodos, todayCalories,
    todayIncome, todayExpense, todayActions,
    bsReadings: bs.length,
    lastBS: bs[0]?.value,
  };
}