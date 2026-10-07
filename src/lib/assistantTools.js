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
    const entityList = entity ? [entity] : ['Note', 'TodoItem', 'Memory', 'Reminder', 'Contact'];
    const results = {};
    for (const e of entityList) {
      if (!jarvis.entities[e]) continue;
      results[e] = await jarvis.entities[e].search(q, getUserFilter(currentUser), 1000);
    }
    const total = Object.values(results).flat().length;
    await logAction('search_data', `Searched: "${q}"`, { query: q, entity }, { total });
    return { success: true, message: `🔍 ${total} találat erre: "${q}".`, data: results };
  },

  call_contact: async ({ name, phone }) => {
    const n = name || 'Ismeretlen';
    await logAction('call_contact', `Call trigger: ${n}`, { name: n, phone }, { triggered: true });
    if (phone) window.location.href = `tel:${phone.replace(/\s/g, '')}`;
    return { success: true, message: `📞 Hívás indítása: ${n} – ${phone || 'szám ismeretlen'}.`, data: { name: n, phone } };
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
        unit_price: unitPrice,
        total: quantity * unitPrice
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
    return { success: true, message: `🧾 Számla létrehozva: ${inv_number} – ${cn} – ${total.toFixed(2)} Ft`, data: invoice };
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
      doc.text(`${item.description || ''} – ${item.quantity || 1} × ${item.unit_price || 0} Ft = ${item.total || 0} Ft`, 20, y);
      y += 10;
    });
    doc.setFontSize(14);
    doc.text(`ÖSSZESEN: ${(inv.total_amount || 0).toFixed(2)} Ft`, 20, y + 10);
    doc.save(`${inv.invoice_number}.pdf`);
    await logAction('generate_pdf', `PDF generated: ${inv.invoice_number}`, { invoice_id }, { file: `${inv.invoice_number}.pdf` });
    return { success: true, message: `📄 PDF letöltve: ${inv.invoice_number}.pdf`, data: { invoice: inv } };
  },

  draft_email: async ({ to, subject, body }) => {
    const recipient = requireString(to, 'email cím');
    const sub = subject || 'Tárgy nélkül';

    try {
      const res = await jarvis.functions.invoke('gmailSend', { to: recipient, subject: sub, body: body || '' });
      if (res?.data?.success) {
        await logAction('draft_email', `Email sent via Gmail API to ${recipient}`, { to: recipient, subject: sub }, { sent: true });
        return { success: true, message: `📧 Email elküldve: ${recipient} – "${sub}"`, data: { to: recipient, subject: sub, sent: true } };
      }
    } catch {}

    const mailto = `mailto:${recipient}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(body || '')}`;
    window.open(mailto);
    await logAction('draft_email', `Email drafted (mailto) to ${recipient}`, { to: recipient, subject: sub }, { opened: true });
    return { success: true, message: `📧 Email szerkesztő megnyitva – Címzett: ${recipient}, Tárgy: "${sub}"`, data: { to: recipient, subject: sub, sent: false } };
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
    const rows = await jarvis.entities.BloodSugar.filter(getUserFilter(currentUser), '-date', 5);
    const latest = rows[0] || null;
    if (!latest) {
      return { success: false, message: '❌ Még nincs rögzítve vércukor érték.' };
    }
    await logAction('read_latest_blood_sugar', 'Read latest blood sugar', { latest }, { latest });
    return {
      success: true,
      message: `🩸 Legutóbbi vércukor: ${latest.value} mmol/L (${latest.time_of_day || 'reggel'})`,
      data: latest
    };
  },

  open_map: async ({ query, destination }) => {
    const search = String(query || destination || 'Budapest').trim();
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(search)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    await logAction('open_map', `Open map: ${search}`, { query: search }, { url });
    return {
      success: true,
      message: `🗺️ Térkép megnyitva: ${search}`,
      data: { url }
    };
  },

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
    const summary = `⚡ Ecosystem Score: ${analysis.score}/100 | Bevétel: ${analysis.totalRevenue.toFixed(0)} Ft | Profit: ${analysis.netProfit.toFixed(0)} Ft | Margin: ${analysis.margin.toFixed(1)}%`;
    await logAction('analyze_ecosystem', 'Ecosystem analysis run', {}, { score: analysis.score });
    return { success: true, data: { summary, analysis } };
  },
};

TOOLS.create_invoice_and_email = async ({ client_name, client_email, items, notes, email_subject }) => {
  const invoice = await TOOLS.create_invoice({ client_name, client_email, items, notes });
  const recipient = client_email || invoice?.data?.client_email || '';
  if (!recipient) {
    return { success: false, message: '❌ A számlához szükség van egy e-mail címre.' };
  }
  const emailBody = [
    `Tisztelt ${client_name}!`,
    '',
    `A számla összege: ${invoice.data.total_amount} Ft`,
    `Számla azonosító: ${invoice.data.invoice_number}`,
    '',
    'Köszönettel,',
    'Jarvis AI'
  ].join('\n');

  const emailResult = await TOOLS.draft_email({
    to: recipient,
    subject: email_subject || `Számla ${invoice.data.invoice_number}`,
    body: emailBody
  });

  return {
    success: true,
    message: `✅ Számla létrehozva és elküldve e-mailben.`,
    data: {
      invoice: invoice.data,
      email: emailResult.data
    }
  };
};

syncDiscoveredTools(Object.keys(TOOLS));

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
  } catch {}

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
  return `You are a UNIFIED INTELLIGENCE SYSTEM — Jarvis AI Assistant for Windows 10/11.
  You can seamlessly handle text and voice commands.
  You have access to ALL tools: maps, glucose tracking, invoicing, email, reminders, contacts, and smart devices.
  Always respond in Hungarian (user's language).
  Execute actions immediately when requested.
  ${langInstruction}`;
}

export function parseActions(reply) {
  if (!reply || typeof reply !== 'string') return [];
  const jsonBlockMatch = reply.match(/\`\`\`actions?\s*([\s\S]*?)\`\`\`/i);
  if (!jsonBlockMatch) return [];
  try {
    const parsed = JSON.parse(jsonBlockMatch[1].trim());
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const valid = arr.filter(a => a && typeof a.tool === 'string' && validateAction(a));
    return valid;
  } catch (err) {
    logger.warn('parseActions', 'Failed to parse JSON action block', { err: err?.message });
    return [];
  }
}

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
