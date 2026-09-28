import { TOOLS } from '@/lib/assistantTools';
import { addDaysToDateKey, localDateKey } from '@/lib/localDate';

const today = () => localDateKey();

function addDays(dateString, days) {
  return addDaysToDateKey(dateString || today(), days);
}

export function getWorkflowSuggestions(ctx) {
  if (!ctx) return [];

  const overdueInvoices = (ctx.invoices || []).filter(inv =>
    inv.status !== 'kifizetve' && inv.due_date && inv.due_date < today()
  );

  return overdueInvoices.slice(0, 3).map((invoice) => ({
    id: `invoice-workflow-${invoice.id}`,
    type: 'overdue_invoice_workflow',
    label: `🧾 Késő számla workflow: ${invoice.invoice_number || invoice.client_name || 'számla'}`,
    prompt: `A(z) ${invoice.invoice_number || invoice.client_name || 'számla'} lejárt. Hozzak létre hozzá teendőt és késedelmi díj emlékeztetőt?`,
    invoice,
  }));
}

export async function runWorkflow(type, payload) {
  if (type !== 'overdue_invoice_workflow' || !payload?.invoice) {
    return [];
  }

  const invoice = payload.invoice;
  const invoiceLabel = invoice.invoice_number || invoice.client_name || 'lejárt számla';
  const reminderDate = addDays(today(), 3);

  const taskResult = await TOOLS.create_task({
    title: `Kövesd a lejárt számlát: ${invoiceLabel}`,
    description: `Lejárt számla követése és ügyfél egyeztetés: ${invoiceLabel}`,
    due_date: today(),
    category: 'finance',
  });

  const reminderResult = await TOOLS.create_reminder({
    title: `Késedelmi díj ellenőrzése: ${invoiceLabel}`,
    description: `Ellenőrizd, szükséges-e késedelmi díjat felszámítani a következő számlánál: ${invoiceLabel}`,
    due_date: reminderDate,
    due_time: '09:00',
    category: 'finance',
  });

  return [taskResult, reminderResult];
}