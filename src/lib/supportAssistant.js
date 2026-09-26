const SUPPORT_TOPICS = [
  {
    intent: 'tasks',
    keywords: ['task', 'todo', 'teendő', 'feladat'],
    hu: 'Feladatot az Eszközök oldalon vagy chatből adhatsz hozzá: írd például, hogy „adj hozzá egy feladatot holnapra”.',
    en: 'You can add tasks from Tools or directly in chat: say “add a task for tomorrow”.',
  },
  {
    intent: 'reminders',
    keywords: ['reminder', 'emlékeztető', 'remind'],
    hu: 'Emlékeztetőt a Reminders/Emlékeztetők oldalon vagy chatből hozhatsz létre dátummal és idővel.',
    en: 'You can create reminders from the Reminders page or by asking in chat with a date and time.',
  },
  {
    intent: 'voice',
    keywords: ['voice', 'microphone', 'mic', 'hang', 'mikrofon', 'beszéd'],
    hu: 'A hangvezérlést a chat mikrofon gombjával vagy a Live Assistant oldalon indíthatod; beszéd közben a mikrofon szünetel.',
    en: 'Start voice control with the chat microphone button or Live Assistant; the microphone pauses while the assistant speaks.',
  },
  {
    intent: 'avatar',
    keywords: ['avatar', '3d', 'face', 'lip', 'száj', 'arc'],
    hu: 'A 3D avatar a Live Assistant oldalon működik; valódi szájmozgáshoz mouthOpen/jawOpen/viseme morph targetes GLB modell kell.',
    en: 'The 3D avatar runs on Live Assistant; real lip sync needs a GLB with mouthOpen, jawOpen, or viseme morph targets.',
  },
  {
    intent: 'finance',
    keywords: ['finance', 'money', 'expense', 'income', 'pénz', 'kiadás', 'bevétel'],
    hu: 'Pénzügyeket az Eszközök → Finance részen vagy chatből rögzíthetsz: „rögzíts 12 font kiadást ebédre”.',
    en: 'Track finances in Tools → Finance or by saying: “log a £12 lunch expense”.',
  },
  {
    intent: 'invoice',
    keywords: ['invoice', 'számla', 'pdf'],
    hu: 'Számlát az Eszközök → Invoices részen készíthetsz, vagy kérheted chatben ügyfélnévvel és tételekkel.',
    en: 'Create invoices in Tools → Invoices, or ask in chat with the client name and line items.',
  },
  {
    intent: 'contacts',
    keywords: ['contact', 'phonebook', 'kapcsolat', 'telefonkönyv'],
    hu: 'Kapcsolatokat a Kapcsolatok oldalon adhatsz hozzá, kereshetsz, importálhatsz és hívhatsz.',
    en: 'Use the Contacts page to add, search, import, and call contacts.',
  },
  {
    intent: 'settings',
    keywords: ['settings', 'beállítás', 'language', 'dark mode', 'nyelv', 'sötét'],
    hu: 'A Beállítások oldalon módosíthatod a nyelvet, témát, asszisztens viselkedést, értesítéseket és személyes szolgáltatásokat.',
    en: 'Use Settings to change language, theme, assistant behavior, notifications, and personal service preferences.',
  },
  {
    intent: 'navigation',
    keywords: ['navigate', 'navigation', 'maps', 'drive', 'navigáció', 'térkép', 'vezetés'],
    hu: 'Navigációt chatből, a vezetési módból vagy a Kapcsolatok címadataiból indíthatsz.',
    en: 'Start navigation from chat, driving mode, or saved contact addresses.',
  },
  {
    intent: 'obd',
    keywords: ['obd', 'car', 'vehicle', 'auto', 'diagnostic', 'autó', 'diagnosztika'],
    hu: 'Autódiagnosztikát az OBD2 vagy Automotive oldalon indíthatsz járműprofil, VIN és adapter kapcsolat után.',
    en: 'Use OBD2 or Automotive pages for diagnostics after setting up a vehicle profile, VIN, and adapter connection.',
  },
];

function isSupportQuestion(text) {
  const lower = text.toLowerCase();
  return /\b(how|where|help|support|use|open|find|can i|hogyan|hol|segíts|segit|támogatás|használ|nyiss|találom)\b/i.test(lower);
}

function languageOf(lang) {
  return String(lang || '').toLowerCase().startsWith('hu') ? 'hu' : 'en';
}

function userContextLine(ctx, locale) {
  const tasks = ctx?.todos?.length || 0;
  const reminders = ctx?.reminders?.length || 0;
  const contacts = ctx?.contacts?.length || 0;
  if (locale === 'hu') return `Jelenlegi adataid alapján: ${tasks} nyitott feladat, ${reminders} aktív emlékeztető, ${contacts} kapcsolat.`;
  return `From your current data: ${tasks} open tasks, ${reminders} active reminders, ${contacts} contacts.`;
}

export function findSupportResponse(text, ctx, lang = 'hu') {
  const input = typeof text === 'string' ? text.trim() : '';
  if (!input || !isSupportQuestion(input)) return null;

  const lower = input.toLowerCase();
  const topic = SUPPORT_TOPICS.find((item) => item.keywords.some((keyword) => lower.includes(keyword)));
  if (!topic) return null;

  const locale = languageOf(lang);
  return {
    handled: true,
    intent: `support_${topic.intent}`,
    reply: `${topic[locale]}\n\n${userContextLine(ctx, locale)}`,
  };
}