import { jarvis } from '@/api/jarvisClient';
import { ENV_TOOLS } from './environmentTools';
import { translateText, SUPPORTED_LANGUAGES } from './languageEngine';
import { loadEcosystemData, analyzeEcosystem, buildEcosystemContext } from './ecosystemEngine';
import { sanitizeString, escapePromptValue, validateAction } from './assistantTools/sanitization';
import { logger } from '@/lib/logger';
import { buildCapabilityPrompt, getApprovalMode, syncDiscoveredTools } from '@/lib/capabilityRegistry';
import { recordActionEpisode } from '@/lib/agentMemory';
import { localDateKey } from '@/lib/localDate';

const today = () => localDateKey();

const ACTION_LOG_MAX_CHARS = 50 * 1024;

function truncateText(value, maxLength = ACTION_LOG_MAX_CHARS) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…[truncated ${text.length - maxLength} chars]`;
}

function safeStringify(value, maxLength = ACTION_LOG_MAX_CHARS) {
  const seen = new WeakSet();
  try {
    const serialized = JSON.stringify(value, (_key, current) => {
      if (typeof current === 'bigint') return `${current.toString()}n`;
      if (current && typeof current === 'object') {
        if (seen.has(current)) return '[Circular]';
        seen.add(current);
      }
      return current;
    });
    return truncateText(serialized ?? value, maxLength);
  } catch (error) {
    const type = Object.prototype.toString.call(value);
    return truncateText(`[Unserializable ${type}: ${String(error?.message || error)}]`, maxLength);
  }
}

function serializeLogValue(value) {
  if (value !== null && (typeof value === 'object' || typeof value === 'bigint')) return safeStringify(value);
  return truncateText(value);
}

function createInvoiceNumber() {
  const datePart = today().replaceAll('-', '');
  let token = '';
  if (globalThis.crypto?.randomUUID) {
    token = globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  } else if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
    token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 12).toUpperCase();
  } else {
    token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.slice(-12).toUpperCase();
  }
  return `INV-${datePart}-${token}`;
}

async function getCurrentUserOrThrow() {
  const currentUser = await jarvis.auth.me().catch(() => null);
  if (!currentUser?.email) throw new Error('A művelethez be kell jelentkezned.');
  return currentUser;
}

function getUserFilter(currentUser) {
  if (!currentUser?.email) throw new Error('A művelethez be kell jelentkezned.');
  return { created_by: currentUser.email };
}

function withOwner(data, currentUser) {
  return { ...data, created_by: currentUser.email };
}

// ─── SAFE ACTION LOGGER (never throws) ───────────────────────────────────────
async function logAction(action_type, description, payload, result, status = 'completed') {
  try {
    const currentUser = await getCurrentUserOrThrow();
    await jarvis.entities.ActionLog.create(withOwner({
      action_type,
      description,
      payload: serializeLogValue(payload),
      result: serializeLogValue(result),
      status,
    }, currentUser));
  } catch (error) {
    logger.warn('assistantTools', 'Action log write failed', { action_type, message: error?.message });
  }
}

// ─── INPUT VALIDATORS ─────────────────────────────────────────────────────────
function requireString(val, name) {
  if (!val || typeof val !== 'string' || !val.trim()) throw new Error(`Hiányzó adat: ${name}`);
  return val.trim();
}
function requireNumber(val, name) {
  return requireStrictNumber(val, name);
}

function requireStrictNumber(val, name, { min = -Infinity, max = Infinity } = {}) {
  const raw = typeof val === 'number' ? String(val) : String(val ?? '').trim().replace(',', '.');
  if (!raw || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) {
    throw new Error(`Érvénytelen szám: ${name}`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Érvénytelen szám: ${name}`);
  return n;
}

// ─── TOOL DEFINITIONS ────────────────────────────────────────────────────────

export const TOOLS = {
  create_note: async ({ title, content }) => {
    const currentUser = await getCurrentUserOrThrow();
    const t = title?.trim() || content?.trim()?.slice(0, 60) || 'Jegyzet';
    const note = await jarvis.entities.Note.create(withOwner({ title: t, content: content || '' }, currentUser));
    await logAction('create_note', `Note created: "${t}"`, { title: t, content }, note);
    return { success: true, message: `✅ Létrehoztam a(z) "${t}" nevű jegyzetet.`, data: note };
  },

  create_task: async ({ title, description, due_date, category }) => {
    const currentUser = await getCurrentUserOrThrow();
    const t = title?.trim() || description?.trim()?.slice(0, 60) || 'Feladat';
    const task = await jarvis.entities.TodoItem.create(withOwner({
      title: t, description: description || '', due_date: due_date || null,
      category: category || 'general', is_completed: false
    }, currentUser));
    await logAction('create_task', `Task created: "${t}"`, { title: t, due_date }, task);
    return { success: true, message: `✅ Feladat hozzáadva: "${t}"${due_date ? ` – határidő: ${due_date}` : ''}.`, data: task };
  },

  create_reminder: async ({ title, description, due_date, due_time, category }) => {
    const currentUser = await getCurrentUserOrThrow();
    // Fallback title from description or time if missing
    const t = title?.trim() || description?.trim()?.slice(0, 60) || (due_time ? `Emlékeztető ${due_time}` : 'Emlékeztető');
    const reminder = await jarvis.entities.Reminder.create(withOwner({
      title: t, description: description || '', due_date: due_date || null,
      due_time: due_time || null, category: category || 'other', is_done: false
    }, currentUser));
    await logAction('create_reminder', `Reminder: "${t}"`, { title: t, due_date, due_time }, reminder);
    return { success: true, message: `⏰ Emlékeztető beállítva: "${t}"${due_date ? ` – ${due_date} ${due_time || ''}` : ''}.`, data: reminder };
  },

  create_contact: async ({ name, phone, email, relationship, notes }) => {
    const currentUser = await getCurrentUserOrThrow();
    const n = requireString(name, 'kapcsolat neve');
    const contact = await jarvis.entities.Contact.create(withOwner({
      name: n, phone: phone || '', email: email || '',
      relationship: relationship || '', notes: notes || '', last_contacted: today()
    }, currentUser));
    await logAction('create_contact', `Contact added: "${n}"`, { name: n, phone, email }, contact);
    return { success: true, message: `👤 Kapcsolat hozzáadva: ${n}${phone ? ` (${phone})` : ''}.`, data: contact };
  },

  search_contacts: async ({ query }) => {
    const currentUser = await getCurrentUserOrThrow();
    const q = requireString(query, 'keresési feltétel').toLowerCase();
    const results = await jarvis.entities.Contact.search(q, getUserFilter(currentUser), 1000);
    await logAction('search_contacts', `Searched contacts: "${q}"`, { query: q }, { count: results.length });
    return { success: true, message: `🔍 ${results.length} találat: ${results.map(c => c.name).join(', ') || 'nincs'}.`, data: results };
  },

  search_data: async ({ query, entity }) => {
    const currentUser = await getCurrentUserOrThrow();
    const q = requireString(query, 'keresési feltétel').toLowerCase();
    const entityList = entity ? [entity] : [
      'Note', 'TodoItem', 'Memory', 'Reminder', 'Contact',
      'Invoice', 'FinanceEntry', 'BloodSugar', 'MealLog',
      'SmartDevice', 'Scene', 'Routine', 'Business', 'BusinessClient',
      'BusinessProject', 'Employee', 'SavedLocation', 'FuelLog',
      'VehicleProfile', 'RetailProduct', 'RetailSale', 'RouteHistory'
    ];
    const results = {};
    for (const e of entityList) {
      const api = jarvis.entities[e];
      if (!api) continue;
      try {
        results[e] = await api.search(q, getUserFilter(currentUser), 1000);
      } catch {
        const rows = await api.filter(getUserFilter(currentUser)).catch(() => []);
        results[e] = (rows || []).filter((row) =>
          safeStringify(row, 20000).toLowerCase().includes(q)
        );
      }
    }
    const total = Object.values(results).flat().length;
    await logAction('search_data', `Searched all Jarvis data: "${q}"`, { query: q, entity }, { total, entities:Object.keys(results) });
    return { success: true, message: `🔍 ${total} találat erre: "${q}" ${Object.keys(results).length} adattípusban.`, data: results };
  },

  call_contact: async ({ name, phone }) => {
    const n = String(name || '').trim() || 'Ismeretlen';
    let resolvedPhone = String(phone || '').trim();
    if (!resolvedPhone && name) {
      const currentUser = await getCurrentUserOrThrow();
      const matches = await jarvis.entities.Contact.search(String(name).toLowerCase(), getUserFilter(currentUser), 50).catch(() => []);
      const exact = matches.find((item) => String(item?.name || '').toLowerCase() === String(name).toLowerCase());
      const selected = exact || matches.find((item) => item?.phone) || null;
      resolvedPhone = String(selected?.phone || '').trim();
    }
    if (!resolvedPhone) {
      await logAction('call_contact', `Call blocked: ${n}`, { name:n, phone:null }, { triggered:false }, 'failed');
      return { success:false, message:`❌ Nem találok telefonszámot ehhez a kapcsolathoz: ${n}.`, data:{ name:n, phone:null } };
    }
    await logAction('call_contact', `Call trigger: ${n}`, { name:n, phone:resolvedPhone }, { triggered:true });
    window.location.href = `tel:${resolvedPhone.replace(/\s/g, '')}`;
    return { success:true, message:`📞 Hívás indítása: ${n} – ${resolvedPhone}.`, data:{ name:n, phone:resolvedPhone } };
  },

  create_invoice: async ({ client_name, client_email, items, notes }) => {
    const currentUser = await getCurrentUserOrThrow();
    const cn = requireString(client_name, 'ügyfél neve');
    const inv_number = createInvoiceNumber();
    if (!Array.isArray(items) || items.length === 0) throw new Error('A számlához legalább egy tétel szükséges.');
    const processedItems = items.map((item, index) => {
      const quantity = requireStrictNumber(item?.quantity, `tétel ${index + 1} mennyisége`, { min:0.000001, max:1000000 });
      const unitPrice = requireStrictNumber(item?.unit_price, `tétel ${index + 1} egységára`, { min:0, max:1000000000 });
      const description = String(item?.description || 'Tétel').trim() || 'Tétel';
      return {
        description,
        quantity,
        unit_price:unitPrice,
        total:quantity * unitPrice
      };
    });
    const total = processedItems.reduce((sum, item) => sum + item.total, 0);
    if (!Number.isFinite(total)) throw new Error('Érvénytelen számlaösszeg.');
    const invoice = await jarvis.entities.Invoice.create(withOwner({
      invoice_number: inv_number, client_name: cn, client_email: client_email || '',
      items: processedItems, total_amount: total, notes: notes || '',
      issue_date: today(), status: 'piszkozat'
    }, currentUser));
    await logAction('create_invoice', `Invoice: ${inv_number} for ${cn}`, { client_name: cn, total }, invoice);
    return { success: true, message: `🧾 Számla létrehozva: ${inv_number} – ${cn} – £${total.toFixed(2)}`, data: invoice };
  },

  generate_pdf: async ({ invoice_id }) => {
    if (!invoice_id) return { success: false, message: '❌ Kérlek add meg a számlaszámot (invoice_id) a PDF generáláshoz.' };
    const currentUser = await getCurrentUserOrThrow();
    const invoices = await jarvis.entities.Invoice.filter(getUserFilter(currentUser));
    const inv = invoices.find(i => i.id === invoice_id);
    if (!inv) return { success: false, message: `❌ Nem található számla (id: ${invoice_id}). Kérlek ellenőrizd a számlaszámot.` };
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('SZÁMLA / INVOICE', 20, 25);
    doc.setFontSize(11);
    doc.text(`Számlaszám: ${inv.invoice_number}`, 20, 45);
    doc.text(`Dátum: ${inv.issue_date || today()}`, 20, 55);
    doc.text(`Vevő: ${inv.client_name || 'N/A'}`, 20, 70);
    let y = 90;
    (inv.items || []).forEach(item => {
      if (y > 260) { doc.addPage(); y = 20; }
      doc.text(`${item.description || ''} – ${item.quantity || 1} × £${item.unit_price || 0} = £${item.total || 0}`, 20, y);
      y += 10;
    });
    doc.setFontSize(14);
    doc.text(`ÖSSZESEN: £${(inv.total_amount || 0).toFixed(2)}`, 20, y + 10);
    const fileName = `${inv.invoice_number}.pdf`;
    doc.save(fileName);
    await logAction('generate_pdf', `PDF generated: ${inv.invoice_number}`, { invoice_id }, { file:fileName });
    return { success:true, message:`📄 PDF elkészült: ${fileName}`, data:{ invoice:inv, fileName } };
  },

  draft_email: async ({ to, subject, body }) => {
    const recipient = requireString(to, 'email cím');
    const sub = subject || 'Tárgy nélkül';

    // Try Gmail API send first; fall back to mailto on failure
    try {
      const res = await jarvis.functions.invoke('gmailSend', { to: recipient, subject: sub, body: body || '' });
      if (res?.data?.success) {
        await logAction('draft_email', `Email sent via Gmail API to ${recipient}`, { to: recipient, subject: sub }, { sent: true });
        return { success: true, message: `📧 Email elküldve: ${recipient} – "${sub}"`, data: { to: recipient, subject: sub, sent: true } };
      }
    } catch { /* Gmail connector not set up — fall through to mailto */ }

    const mailto = `mailto:${recipient}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(body || '')}`;
    window.open(mailto);
    await logAction('draft_email', `Email drafted (mailto) to ${recipient}`, { to: recipient, subject: sub }, { opened: true });
    return { success: true, message: `📧 Email szerkesztő megnyitva – Címzett: ${recipient}, Tárgy: "${sub}"`, data: { to: recipient, subject: sub, sent: false } };
  },

  create_invoice_and_email: async ({ client_name, client_email, items, notes, email_subject }) => {
    const recipient = requireString(client_email, 'email cím');
    const invoiceResult = await TOOLS.create_invoice({ client_name, client_email: recipient, items, notes });
    if (invoiceResult?.success === false || !invoiceResult?.data) return invoiceResult;
    const invoice = invoiceResult.data;

    const pdfResult = await TOOLS.generate_pdf({ invoice_id:invoice.id });
    if (pdfResult?.success === false) {
      return {
        success:false,
        message:`❌ A számla elkészült, de a PDF generálása nem sikerült: ${invoice.invoice_number}.`,
        data:{ invoice, pdf:pdfResult?.data || null }
      };
    }

    const body = [
      `Kedves ${client_name},`,
      '',
      `Elkészült a számla: ${invoice.invoice_number}.`,
      `Összeg: £${Number(invoice.total_amount || 0).toFixed(2)}.`,
      `PDF: ${pdfResult?.data?.fileName || invoice.invoice_number + '.pdf'}`,
      '',
      'Üdvözlettel,',
      'Jarvis',
    ].join('\n');
    const emailResult = await TOOLS.draft_email({
      to: recipient,
      subject: email_subject || `Számla ${invoice.invoice_number}`,
      body,
    });
    const sent = emailResult?.data?.sent === true;
    return {
      success: emailResult?.success !== false,
      message: sent
        ? `✅ Számla és PDF elkészült, az email elküldve: ${invoice.invoice_number}.`
        : `✅ Számla és PDF elkészült: ${invoice.invoice_number}. Az email szerkesztő megnyílt; a PDF-et csatolni kell, mert közvetlen Gmail-küldés nincs konfigurálva.`,
      data: { invoice, pdf:pdfResult?.data || null, email:emailResult?.data || null },
    };
  },

  log_blood_sugar: async ({ value, time_of_day }) => {
    const currentUser = await getCurrentUserOrThrow();
    const v = requireNumber(value, 'vércukorérték');
    if (v < 1 || v > 40) return { success: false, message: `❌ Érvénytelen vércukorérték: ${v}. Kérlek ellenőrizd (normál: 4–10 mmol/L).` };
    const bs = await jarvis.entities.BloodSugar.create(withOwner({ value: v, time_of_day: time_of_day || 'reggel', date: today(), unit: 'mmol/L' }, currentUser));
    await logAction('log_blood_sugar', `Blood sugar: ${v} mmol/L`, { value: v, time_of_day }, bs);
    const warning = v > 10 ? ' ⚠️ Magas érték!' : v < 4 ? ' ⚠️ Alacsony érték!' : '';
    return { success: true, message: `🩸 Vércukor rögzítve: ${v} mmol/L (${time_of_day || 'reggel'})${warning}`, data: bs };
  },

  read_latest_blood_sugar: async () => {
    const currentUser = await getCurrentUserOrThrow();
    const rows = await jarvis.entities.BloodSugar.filter(getUserFilter(currentUser), '-date', 1).catch(() => []);
    const latest = rows?.[0] || null;
    if (!latest) return { success: false, message: '❌ Még nincs rögzítve vércukorérték.' };
    await logAction('read_latest_blood_sugar', 'Read latest blood sugar', {}, { id: latest.id, value: latest.value });
    return {
      success: true,
      message: `🩸 Legutóbbi vércukor: ${latest.value} mmol/L${latest.time_of_day ? ` (${latest.time_of_day})` : ''}.`,
      data: latest,
    };
  },

  log_meal: async ({ meal_name, meal_type, calories }) => {
    const currentUser = await getCurrentUserOrThrow();
    const mn = requireString(meal_name, 'étel neve');
    const cal = calories == null || calories === '' ? 0 : requireStrictNumber(calories, 'kalória', { min:0 });
    const meal = await jarvis.entities.MealLog.create(withOwner({ meal_name: mn, meal_type: meal_type || 'reggeli', calories: cal, date: today() }, currentUser));
    await logAction('log_meal', `Meal: ${mn}`, { meal_name: mn, calories: cal }, meal);
    return { success: true, message: `🍽️ Étkezés rögzítve: ${mn}${cal ? ` (${cal} kcal)` : ''}`, data: meal };
  },

  log_finance: async ({ description, amount, type, category }) => {
    const currentUser = await getCurrentUserOrThrow();
    const desc = requireString(description, 'leírás');
    const amt = requireNumber(amount, 'összeg');
    if (amt <= 0) return { success: false, message: '❌ Az összegnek pozitívnak kell lennie.' };
    const t = ['income', 'expense'].includes(type) ? type : 'expense';
    const entry = await jarvis.entities.FinanceEntry.create(withOwner({
      description: desc, amount: amt, type: t, category: category || 'magan', date: today()
    }, currentUser));
    await logAction('log_finance', `Finance: ${desc} £${amt}`, { description: desc, amount: amt, type: t }, entry);
    return { success: true, message: `💰 Pénzügyi tétel: ${desc} – ${t === 'income' ? '+' : '-'}£${amt}`, data: entry };
  },

  open_map: async ({ query, destination } = {}) => {
    const target = requireString(String(destination || query || '').trim(), 'térkép cél');
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    await logAction('open_map', `Open map: ${target}`, { target }, { url });
    return { success: true, message: `🗺️ Térkép megnyitva: ${target}.`, data: { url, target } };
  },

  // Environment tools – delegate to ENV_TOOLS
  control_device: async (params) => ENV_TOOLS.control_device(params),
  check_device_status: async (params) => ENV_TOOLS.check_device_status(params),
  trigger_scene: async (params) => ENV_TOOLS.trigger_scene(params),
  run_routine: async (params) => ENV_TOOLS.run_routine(params),

  translate_text: async ({ text, target_language }) => {
    const t = requireString(text, 'fordítandó szöveg');
    const lang = requireString(target_language, 'célnyelv');
    const translated = await translateText(t, lang);
    const langName = SUPPORTED_LANGUAGES.find(l => l.code === lang)?.name || lang;
    await logAction('translate_text', `Translated to ${langName}`, { target_language: lang, length: t.length }, { translated });
    return { success: true, message: `🌐 Fordítás (${langName}):\n\n${translated}`, data: { translated, target_language: lang } };
  },

  save_memory: async ({ content, category, importance }) => {
    const currentUser = await getCurrentUserOrThrow();
    const c = requireString(content, 'memória tartalom');
    const imp = Math.min(10, Math.max(1, parseInt(importance) || 7));
    const mem = await jarvis.entities.Memory.create(withOwner({ content: c, category: category || 'fact', importance: imp }, currentUser));
    await logAction('save_memory', `Memory saved`, { content: c }, mem);
    return { success: true, message: `🧠 Megjegyeztem: "${c}"`, data: mem };
  },

  analyze_ecosystem: async () => {
    const data = await loadFullContext();
    const analysis = analyzeEcosystem({
      businesses: data.businesses || [],
      projects: data.projects || [],
      employees: data.employees || [],
      clients: data.clients || [],
      invoices: data.invoices || [],
      todos: data.todos || [],
      finance: data.finance || [],
      reminders: data.reminders || [],
      meds: data.meds || [],
    });
    const summary = `⚡ Ecosystem Score: ${analysis.score}/100 | Bevétel: £${analysis.totalRevenue.toFixed(0)} | Profit: £${analysis.netProfit.toFixed(0)} (${analysis.margin.toFixed(1)}%) | Ineffektivitások: ${analysis.inefficiencies.length} | Top javaslat: ${analysis.recommendations[0]?.title || 'n/a'}`;
    await logAction('analyze_ecosystem', 'Ecosystem analysis run', {}, { score: analysis.score });
    return { success: true, data: { summary, analysis } };
  },

  optimize_workload: async () => {
    const data = await loadFullContext();
    const analysis = analyzeEcosystem({
      businesses: data.businesses || [],
      projects: data.projects || [],
      employees: data.employees || [],
      clients: data.clients || [],
      invoices: data.invoices || [],
      todos: data.todos || [],
      finance: data.finance || [],
      reminders: data.reminders || [],
      meds: data.meds || [],
    });
    const overloaded = analysis.workloadByBiz.filter(w => w.ratio > 2);
    if (overloaded.length === 0) {
      return { success: true, message: '✅ A munkaterhelés egyenletesen van elosztva.', data: analysis.workloadByBiz };
    }
    const details = overloaded.map(w => `${w.name}: ${w.projects} projekt / ${w.employees} alkalmazott (${w.ratio.toFixed(1)}×)`).join('\n');
    await logAction('optimize_workload', 'Workload analysis', {}, { overloaded: overloaded.length });
    return { success: true, message: `⚖️ Túlterhelt területek:\n${details}\n\nJavaslat: Csökkentsd az egyidejű projekteket vagy bővítsd a csapatot.`, data: overloaded };
  },

  optimize_revenue: async () => {
    const data = await loadFullContext();
    const analysis = analyzeEcosystem({
      businesses: data.businesses || [],
      projects: data.projects || [],
      employees: data.employees || [],
      clients: data.clients || [],
      invoices: data.invoices || [],
      todos: data.todos || [],
      finance: data.finance || [],
      reminders: data.reminders || [],
      meds: data.meds || [],
    });
    const lowMargin = analysis.revenueByBiz.filter(b => b.revenue > 0 && b.margin < 25);
    const topRec = analysis.recommendations.filter(r => r.priority === 'high').map(r => `${r.icon} ${r.title}: ${r.action}`).join('\n');
    await logAction('optimize_revenue', 'Revenue optimization', {}, { lowMargin: lowMargin.length });
    return {
      success: true,
      message: `💰 Bevétel-optimalizálás:\nTeljes margin: ${analysis.margin.toFixed(1)}% | Kintlévőség: £${analysis.unpaidTotal.toFixed(0)}\n\nAlacsony margójú cégek: ${lowMargin.map(b => `${b.name} (${b.margin.toFixed(0)}%)`).join(', ') || 'nincs'}\n\nSürgős teendők:\n${topRec || 'Nincs sürgős feladat.'}`,
      data: analysis,
    };
  },
};

syncDiscoveredTools(Object.keys(TOOLS));

// ─── CONTEXT LOADER ──────────────────────────────────────────────────────────

export async function loadFullContext(refreshCache = false) {
  const startTime = Date.now();

  const currentUser = await getCurrentUserOrThrow();

  const userEmail = currentUser.email;
  const userFilter = getUserFilter(currentUser);

  const [memories, settings, todos, finance, bs, meals, meds, contacts, reminders, actions,
    businesses, projects, employees, clients, invoices, agentEpisodes] = await Promise.all([
    jarvis.entities.Memory.filter(userFilter, '-importance', 20).catch(() => []),
    jarvis.entities.UserSettings.filter(userFilter).catch(() => []),
    jarvis.entities.TodoItem.filter({ ...userFilter, is_completed: false }, '-created_date', 15).catch(() => []),
    jarvis.entities.FinanceEntry.filter(userFilter, '-date', 30).catch(() => []),
    jarvis.entities.BloodSugar.filter(userFilter, '-date', 14).catch(() => []),
    jarvis.entities.MealLog.filter(userFilter, '-date', 14).catch(() => []),
    jarvis.entities.Medication.filter({ ...userFilter, is_active: true }).catch(() => []),
    jarvis.entities.Contact.filter(userFilter, '-created_date', 20).catch(() => []),
    jarvis.entities.Reminder.filter({ ...userFilter, is_done: false }, '-due_date', 10).catch(() => []),
    jarvis.entities.ActionLog.filter(userFilter, '-created_date', 10).catch(() => []),
    jarvis.entities.Business.filter(userFilter).catch(() => []),
    jarvis.entities.BusinessProject.filter(userFilter).catch(() => []),
    jarvis.entities.Employee.filter(userFilter).catch(() => []),
    jarvis.entities.BusinessClient.filter(userFilter).catch(() => []),
    jarvis.entities.Invoice.filter(userFilter, '-created_date', 50).catch(() => []),
    jarvis.entities.AgentEpisode.filter(userFilter, '-created_date', 8).catch(() => []),
  ]);

  const activePromptTunings = await jarvis.functions.invoke('getActivePromptTunings', {})
    .then((response) => response.data?.tunings || [])
    .catch(() => []);

  let ecosystemData = null;
  try {
    const ecoRaw = { businesses, projects, employees, clients, invoices, todos, finance, reminders, meds };
    ecosystemData = analyzeEcosystem(ecoRaw);
  } catch { /* non-critical */ }

  const executionTime = Date.now() - startTime;
  if (executionTime > 2000) {
    logger.warn('loadFullContext', `Slow context load: ${executionTime}ms`);
  }

  return {
    memories, settings: settings[0] || null, todos, finance, bs, meals, meds, contacts, reminders, actions,
    businesses, projects, employees, clients, invoices, agentEpisodes, ecosystem: ecosystemData, userEmail,
    promptTunings: activePromptTunings,
  };
}

export function buildSystemPrompt(ctx, langInstruction = '', userMood = 'neutral') {
  if (!ctx) return 'You are a unified AI assistant. Help the user in their language!';

  const { memories, settings, todos, finance, bs, meals, meds, contacts, reminders, actions, invoices, agentEpisodes, ecosystem, promptTunings } = ctx;
  const todayStr = today();
  const now = new Date();
  const dayNames = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
  const monthNames = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];
  const currentDateTime = `${now.getFullYear()}. ${monthNames[now.getMonth()]} ${now.getDate()}., ${dayNames[now.getDay()]} – ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const todayCalories = (meals || []).filter(m => m.date === todayStr).reduce((s, m) => s + (m.calories || 0), 0);
  const balance = (finance || []).reduce((s, f) => s + (f.type === 'income' ? (f.amount || 0) : -(f.amount || 0)), 0);
  const lastBS = bs?.[0];
  const pendingReminders = (reminders || []).filter(r => !r.is_done);
  const urgentReminders = pendingReminders.filter(r => r.due_date && r.due_date <= todayStr);
  const overdueInvoices = (invoices || []).filter(inv => inv.status !== 'kifizetve' && inv.due_date && inv.due_date < todayStr);
  const recentActions = (actions || []).slice(0, 5).map(a => `${a.action_type}: ${a.description}`).join(', ');
  const openTasks = (todos || []).length;
  const highPriorityTasks = (todos || []).filter(t => t.priority === 'magas' || t.priority === 'surgos');

  const prioritySignals = [];
  if (urgentReminders.length > 0) prioritySignals.push(`URGENT REMINDERS: ${urgentReminders.map(r => r.title).join(', ')}`);
  if (highPriorityTasks.length > 0) prioritySignals.push(`HIGH PRIORITY TASKS: ${highPriorityTasks.map(t => t.title).join(', ')}`);

  // Mood-based tone adjustment
  const moodInstruction = {
    'happy': 'Match their enthusiasm! Be upbeat, positive, encouraging.',
    'sad': 'Be empathetic and supportive. Gently help lift their mood.',
    'angry': 'Stay calm, acknowledge their frustration. Be factual and solution-focused.',
    'confused': 'Be extra clear, use simple language. Break down concepts step by step.',
    'calm': 'Maintain their serenity. Thoughtful, measured responses.',
    'neutral': ''
  }[userMood] || '';

  const tuningInstructions = (promptTunings || [])
    .filter((item) => item.status === 'active' && item.proposed_instruction)
    .map((item) => `- ${escapePromptValue(item.proposed_instruction, 600)}`)
    .join('\n');

  return `You are a UNIFIED INTELLIGENCE SYSTEM — a single coherent AI that seamlessly integrates all capabilities below.
  Name: ${settings?.ai_name || 'Assistant'} | Personality: ${settings?.personality || 'kedves'} | Age group: ${settings?.age_group || 'felnott'} | User Mood: ${userMood}
  ${moodInstruction ? `\n🎭 TONE: ${moodInstruction}` : ''}

${langInstruction}

━━━ APPROVED PROMPT TUNING ━━━
${tuningInstructions || 'No approved tuning instructions.'}

━━━ DATE & TIME ━━━
Current: ${currentDateTime}

━━━ PRIORITY NOW ━━━
${prioritySignals.length > 0 ? prioritySignals.map(signal => escapePromptValue(signal, 300)).join('\n') : 'No urgent signals – operate in standard mode'}

━━━ USER KNOWLEDGE BASE ━━━
Memories: ${(memories || []).map(m => `[${escapePromptValue(m.category || 'fact', 40)}] ${escapePromptValue(m.content, 400)}`).join(' | ') || 'none'}
Medications: ${(meds || []).map(m => `${escapePromptValue(m.name, 80)} ${escapePromptValue(m.dose || '', 40)} ${escapePromptValue(m.frequency || '', 80)}`).join(', ') || 'none'}
Contacts: ${(contacts || []).slice(0, 8).map(c => `${escapePromptValue(c.name, 80)}${c.phone ? ` (${escapePromptValue(c.phone, 40)})` : ''}${c.email ? ` <${escapePromptValue(c.email, 120)}>` : ''}`).join(' | ') || 'none'}

━━━ LIVE STATUS ━━━
Tasks: ${openTasks} open | High priority: ${highPriorityTasks.map(t => escapePromptValue(t.title, 120)).join(', ') || 'none'}
Reminders: ${pendingReminders.slice(0, 3).map(r => `${escapePromptValue(r.title, 120)}${r.due_date ? ` [${escapePromptValue(r.due_date, 20)}]` : ''}`).join(', ') || 'none'}
Finance: Balance £${balance.toFixed(2)} | Overdue invoices: ${overdueInvoices.length} | Recent: ${(finance || []).slice(0, 3).map(f => `${f.type === 'income' ? '+' : '-'}£${f.amount} ${escapePromptValue(f.description, 120)}`).join(', ') || 'none'}
Health: Last BG=${lastBS ? `${lastBS.value} mmol/L (${lastBS.time_of_day})` : 'none'} | Today calories=${todayCalories} kcal
Recent actions: ${recentActions || 'none'}
Recent verified agent operations: ${(agentEpisodes || []).slice(0, 5).map((e) => `${e.kind || 'action'}:${e.goal || e.tool || ''}:${e.outcome || ''}`).join(' | ') || 'none'}

${ecosystem ? buildEcosystemContext(ecosystem) : ''}
━━━ CAPABILITY REGISTRY ━━━
${buildCapabilityPrompt()}

Approval levels: instant = execute immediately; confirm = ask owner before execution; owner = never execute without explicit owner release/system approval.

━━━ RULES ━━━
1. Always respond in the user's language.
2. When you need to DO something, output actions only inside an actions code block with a JSON array of actions. Do not use legacy [ACTION:...] syntax.
3. VALIDATE before acting: if critical info is missing (e.g. invoice has no items), ask the user.
4. If an action fails or seems wrong, explain clearly in the user's language.
5. Never repeat an action already in Recent actions.
6. IMPORTANT: Only mention health data, reminders or finances if the user explicitly asks about them, EXCEPT when the user asks for a full ecosystem overview or when a proactive suggestion explicitly connects modules.
7. Keep responses very short and concrete. In voice use, default to one sentence under 18 words.
8. Cross-functional: one user message can trigger multiple actions at once.
9. For simple greetings like "szia", "hello", "hi" — just greet back briefly. Do NOT volunteer unsolicited health/financial advice.
10. When relevant, notice cross-module patterns such as overdue invoices, missing reminders, negative balance, or health/admin task collisions, and suggest one practical next step.

TOOL SYNTAX: Use an actions code block containing JSON objects with tool and params fields. `;
}

// ─── ACTION PARSER ────────────────────────────────────────────────────────────

/**
 * Parse actions from LLM reply.
 * ONLY accepts JSON block format: ```actions\n[...]\n```
 * Mixed or legacy [ACTION:...] format is rejected for determinism.
 */
export function parseActions(reply) {
  if (!reply || typeof reply !== 'string') return [];

  const jsonBlockMatch = reply.match(/```actions?\s*([\s\S]*?)```/i);
  if (!jsonBlockMatch) return [];

  try {
    const parsed = JSON.parse(jsonBlockMatch[1].trim());
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const valid = arr.filter(a => a && typeof a.tool === 'string' && validateAction(a));
    // Preserve declaration order — no sorting
    return valid;
  } catch (err) {
    logger.warn('parseActions', 'Failed to parse JSON action block', { err: err?.message });
    return [];
  }
}

/**
 * Execute parsed actions sequentially, guaranteed order.
 * Each action: validate → execute → retry once on transient failure → log.
 * On critical failure, remaining actions still run (partial success model).
 */
export async function executeActions(actions, options = {}) {
  const results = [];
  const source = String(options.source || 'assistant');
  const goal = String(options.goal || '');
  const preapprovedTools = new Set(
    Array.isArray(options.preapprovedTools) ? options.preapprovedTools.map(String) : []
  );

  for (const action of actions) {
    if (!validateAction(action)) {
      results.push({ ...action, result: { success: false, message: '❌ Érvénytelen művelet' } });
      continue;
    }

    const toolFn = TOOLS[action.tool];
    if (!toolFn) {
      results.push({ ...action, result: { success: false, message: `❌ Ismeretlen művelet: ${action.tool}` } });
      continue;
    }

    const approvalMode = getApprovalMode(action.tool);
    if (approvalMode === 'owner') {
      const blocked = 'Tulajdonosi engedély szükséges ehhez a művelethez.';
      results.push({ ...action, blocked, result:{success:false,message:`🔒 ${blocked}`} });
      await recordActionEpisode({goal,source,tool:action.tool,params:action.params,result:{success:false,message:blocked}});
      continue;
    }
    if (approvalMode === 'confirm' && !preapprovedTools.has(String(action.tool))) {
      const label = String(action.tool || '').replaceAll('_',' ');
      const approved = typeof window === 'undefined'
        ? false
        : window.confirm(`Jarvis ezt a műveletet készül végrehajtani: ${label}. Engedélyezed?`);
      if (!approved) {
        const blocked = 'A műveletet nem engedélyezted.';
        results.push({ ...action, blocked, result:{success:false,message:`⛔ ${blocked}`} });
        await recordActionEpisode({goal,source,tool:action.tool,params:action.params,result:{success:false,message:blocked}});
        continue;
      }
    }

    let result;
    let lastErr;
    // One retry for transient failures
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await toolFn(action.params);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt === 0) await new Promise(r => setTimeout(r, 500));
      }
    }

    if (lastErr) {
      logger.error('assistantTools', 'Action execution failed', { tool: action.tool, message: lastErr?.message });
      await logAction(action.tool, `Error: ${lastErr.message}`, action.params, null, 'failed');
      const failedResult = { success: false, message: '❌ Ezt most nem sikerült befejezni. Próbáld meg újra.' };
      results.push({ ...action, result: failedResult });
      await recordActionEpisode({goal,source,tool:action.tool,params:action.params,result:failedResult});
    } else {
      logger.info('assistantTools', 'Action executed', { tool: action.tool, success: result?.success !== false });
      results.push({ ...action, result });
      await recordActionEpisode({goal,source,tool:action.tool,params:action.params,result});
    }
  }

  return results;
}