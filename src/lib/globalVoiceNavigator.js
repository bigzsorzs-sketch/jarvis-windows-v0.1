export const VOICE_ROUTE_ALIASES = [
  { path: '/beallitasok', aliases: ['beállítások', 'beallitasok', 'beállítás', 'nyisd meg a beállításokat', 'settings', 'open settings', 'go to settings', 'einstellungen', 'öffne die einstellungen', 'geh zu den einstellungen', 'paramètres', 'ouvre les paramètres', 'aller aux paramètres'] },
  { path: '/chat', aliases: ['chat', 'asszisztens', 'jarvis', 'nyisd meg a chatet', 'nyisd meg az asszisztenst', 'open chat', 'go to chat', 'assistent', 'öffne den chat', 'assistant', 'ouvre le chat'] },
  { path: '/', aliases: ['főoldal', 'kezdőlap', 'nyisd meg a főoldalt', 'home', 'homepage', 'go home', 'startseite', 'geh zur startseite', 'accueil', 'aller à l’accueil'] },
  { path: '/eszkozok', aliases: ['eszközök', 'eszkozok', 'nyisd meg az eszközöket', 'tools', 'open tools', 'werkzeuge', 'öffne die werkzeuge', 'outils', 'ouvre les outils'] },
  { path: '/muszerfal', aliases: ['műszerfal', 'muszerfal', 'nyisd meg a műszerfalat', 'dashboard', 'open dashboard', 'armaturenbrett', 'öffne das dashboard', 'tableau de bord', 'ouvre le tableau de bord'] },
  { path: '/memoria', aliases: ['memória', 'memoria', 'nyisd meg a memóriát', 'memory', 'open memory', 'speicher', 'mémoire'] },
  { path: '/contacts', aliases: ['kapcsolatok', 'kontaktok', 'contacts', 'open contacts', 'kontakte', 'ouvre les contacts'] },
  { path: '/reminders', aliases: ['emlékeztetők', 'emlekeztetok', 'reminders', 'open reminders', 'erinnerungen', 'rappels'] },
  { path: '/smarthome', aliases: ['okosotthon', 'smart home', 'smarthome', 'open smart home', 'smart home öffnen', 'maison intelligente'] },
  { path: '/routines', aliases: ['rutinok', 'routines', 'open routines', 'routinen', 'routines ouvrir'] },
  { path: '/legal', aliases: ['jog', 'jogi', 'legal', 'open legal', 'recht', 'juridique'] },
  { path: '/retail', aliases: ['retail', 'bolt', 'üzlet', 'uzlet', 'store', 'shop', 'einzelhandel', 'magasin'] },
  { path: '/gmail', aliases: ['gmail', 'emailek', 'email', 'levelek', 'emails', 'e-mails'] },
  { path: '/locations', aliases: ['helyek', 'lokációk', 'lokaciok', 'locations', 'orte', 'lieux'] },
  { path: '/habits', aliases: ['szokások', 'szokasok', 'habits', 'gewohnheiten', 'habitudes'] },
  { path: '/obd2', aliases: ['obd', 'obd2', 'autó diagnosztika', 'auto diagnosztika', 'car diagnostics', 'fahrzeugdiagnose', 'diagnostic voiture'] },
  { path: '/jelentesek', aliases: ['jelentések', 'jelentesek', 'reports', 'berichte', 'rapports'] },
  { path: '/tools/finance', aliases: ['pénzügy', 'penzugy', 'finance', 'open finance', 'finanzen', 'finances'] },
  { path: '/tools/invoices', aliases: ['számlák', 'szamlak', 'invoices', 'rechnungen', 'factures'] },
  { path: '/tools/calendar', aliases: ['naptár', 'naptar', 'calendar', 'kalender', 'calendrier'] },
  { path: '/tools/translate', aliases: ['fordító', 'fordito', 'translate', 'übersetzer', 'traduction'] },
  { path: '/tools/quick', aliases: ['gyors műveletek', 'gyorsmuveletek', 'quick actions', 'schnellaktionen', 'actions rapides'] },
  { path: '/tools/image-editor', aliases: ['képszerkesztő', 'kepszerkeszto', 'image editor', 'bildeditor', 'éditeur d’image'] },
];

export function resolveVoiceRoute(text = '') {
  const normalized = text.toLowerCase().trim();
  return VOICE_ROUTE_ALIASES.find(({ aliases }) => aliases.some(alias => normalized.includes(alias)))?.path || null;
}

export function isNavigationCommand(text = '') {
  const normalized = text.toLowerCase();
  return [
    'nyisd meg', 'menj', 'ugorj', 'navigálj', 'navigalj',
    'open', 'go to', 'take me to',
    'öffne', 'geh zu',
    'ouvre', 'aller à',
    'abre', 've a',
    'apri', 'vai a',
    'deschide', 'mergi la',
    'otwórz', 'idź do'
  ].some(keyword => normalized.includes(keyword));
}

export function getRecognitionLangFromText(text = '') {
  const normalized = text.toLowerCase().trim();

  const hungarianSignals = [/[áéíóöőúüű]/i, 'nyisd', 'menj', 'ugorj', 'beállítás', 'műszerfal', 'eszköz', 'főoldal'];
  const englishSignals = ['open', 'go to', 'take me to', 'settings', 'dashboard', 'tools', 'home'];
  const germanSignals = ['öffne', 'geh zu', 'einstellungen', 'werkzeuge', 'startseite', 'armaturenbrett'];
  const frenchSignals = ['ouvre', 'aller à', 'paramètres', 'outils', 'accueil', 'tableau de bord'];

  const matches = (signals) => signals.some((signal) => signal instanceof RegExp ? signal.test(text) : normalized.includes(signal));

  if (matches(hungarianSignals)) return 'hu-HU';
  if (matches(englishSignals)) return 'en-US';
  if (matches(germanSignals)) return 'de-DE';
  if (matches(frenchSignals)) return 'fr-FR';

  return null;
}

export function resolveSettingsAction(text = '') {
  const normalized = text.toLowerCase();
  if ([
    'sötét mód', 'sotet mod', 'dark mode', 'enable dark mode',
    'dunkelmodus', 'dunkler modus',
    'mode sombre'
  ].some((term) => normalized.includes(term))) {
    return { type: 'toggle_theme' };
  }
  if ([
    'világos mód', 'vilagos mod', 'light mode', 'enable light mode',
    'hellmodus', 'heller modus',
    'mode clair'
  ].some((term) => normalized.includes(term))) {
    return { type: 'toggle_theme' };
  }
  return null;
}