import { localDateKey } from '@/lib/localDate';

const today = () => localDateKey();

export function buildAssistantBrainSummary(ctx) {
  if (!ctx) return '';

  const overdueInvoices = (ctx.invoices || []).filter(inv =>
    inv.status !== 'kifizetve' && inv.due_date && inv.due_date < today()
  );
  const overdueReminders = (ctx.reminders || []).filter(rem => rem.due_date && rem.due_date <= today());
  const openTasks = (ctx.todos || []).filter(todo => !todo.is_completed);
  const balance = (ctx.finance || []).reduce((sum, item) => sum + (item.type === 'income' ? (item.amount || 0) : -(item.amount || 0)), 0);
  const lastBloodSugar = ctx.bs?.[0];

  return [
    '━━━ ASSISTANT BRAIN SUMMARY ━━━',
    `Lejárt számlák: ${overdueInvoices.length}`,
    `Nyitott emlékeztetők: ${overdueReminders.length}`,
    `Nyitott feladatok: ${openTasks.length}`,
    `Egyenleg: £${balance.toFixed(2)}`,
    `Utolsó vércukor: ${lastBloodSugar ? `${lastBloodSugar.value} mmol/L` : 'nincs adat'}`,
  ].join('\n');
}

export function buildAssistantBrainSuggestions(ctx, t) {
  if (!ctx) return [];

  const suggestions = [];
  const overdueInvoices = (ctx.invoices || []).filter(inv =>
    inv.status !== 'kifizetve' && inv.due_date && inv.due_date < today()
  );
  const pendingReminders = (ctx.reminders || []).filter(rem => !rem.is_done);
  const openTasks = (ctx.todos || []).filter(todo => !todo.is_completed);
  const negativeBalance = (ctx.finance || []).reduce((sum, item) => sum + (item.type === 'income' ? (item.amount || 0) : -(item.amount || 0)), 0) < 0;

  if (overdueInvoices.length > 0) {
    const invoice = overdueInvoices[0];
    suggestions.push({
      label: `🧾 Lejárt számla: ${invoice.invoice_number || invoice.client_name || 'számla'}`,
      prompt: `Lejárt egy számlám (${invoice.invoice_number || invoice.client_name || 'számla'}). Szeretnéd, hogy hozzak létre róla emlékeztetőt?`,
    });
  }

  if (negativeBalance && pendingReminders.length > 0) {
    suggestions.push({
      label: '💸 Pénzügy + emlékeztetők',
      prompt: 'Negatív az egyenlegem és vannak nyitott emlékeztetőim. Kérlek, segíts priorizálni őket.',
    });
  }

  if (openTasks.length > 0 && pendingReminders.length === 0) {
    suggestions.push({
      label: '✅ Feladatokból emlékeztető',
      prompt: `Van ${openTasks.length} nyitott feladatom. Nézd át, melyikből érdemes emlékeztetőt készíteni.`,
    });
  }

  if (ctx.bs?.length > 0 && overdueInvoices.length > 0) {
    suggestions.push({
      label: '🧠 Teljes ökoszisztéma áttekintés',
      prompt: 'Nézd át együtt a pénzügyeimet, emlékeztetőimet és egészségügyi adataimat, és adj prioritási javaslatot.',
    });
  }

  if (suggestions.length === 0 && pendingReminders.length > 0) {
    suggestions.push({
      label: `⏰ ${pendingReminders[0].title}`,
      prompt: `${t('reminders')}: ${pendingReminders[0].title}`,
    });
  }

  return suggestions.slice(0, 4);
}