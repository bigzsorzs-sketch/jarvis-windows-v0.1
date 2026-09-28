function foldVoiceText(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.!?,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const VOICE_ROUTE_ALIASES = [
  { path: '/', aliases: ['fooldal', 'kezdolap', 'home', 'homepage', 'startseite', 'accueil'] },
  { path: '/chat', aliases: ['chat', 'asszisztens', 'jarvis chat', 'assistant', 'assistent'] },
  { path: '/muszerfal', aliases: ['muszerfal', 'dashboard', 'armaturenbrett', 'tableau de bord'] },
  { path: '/memoria', aliases: ['memoria', 'memory', 'speicher', 'memoire'] },
  { path: '/eszkozok', aliases: ['eszkozok', 'tools', 'werkzeuge', 'outils'] },
  { path: '/beallitasok', aliases: ['beallitasok', 'beallitas', 'settings', 'einstellungen', 'parametres'] },
  { path: '/contacts', aliases: ['kapcsolatok', 'kontaktok', 'contacts', 'kontakte'] },
  { path: '/reminders', aliases: ['emlekeztetok', 'feladatok', 'tasks', 'reminders', 'erinnerungen', 'rappels'] },
  { path: '/smarthome', aliases: ['okosotthon', 'okos otthon', 'smart home', 'smarthome', 'maison intelligente'] },
  { path: '/routines', aliases: ['rutinok', 'routines', 'routinen'] },
  { path: '/holding', aliases: ['holding', 'cegek', 'vallalkozasok', 'businesses'] },
  { path: '/legal', aliases: ['jog', 'jogi', 'legal', 'recht', 'juridique'] },
  { path: '/privacy-terms', aliases: ['adatvedelem', 'privacy', 'privacy terms', 'feltetelek'] },
  { path: '/release-checklist', aliases: ['release checklist', 'kiadas ellenorzes', 'kiadasi lista'] },
  { path: '/automotive', aliases: ['auto diagnosztika', 'autodiagnosztika', 'automotive', 'car diagnostics'] },
  { path: '/retail', aliases: ['retail', 'bolt', 'uzlet', 'store', 'shop'] },
  { path: '/gmail', aliases: ['gmail', 'emailek', 'email', 'levelek', 'mail'] },
  { path: '/locations', aliases: ['helyek', 'lokaciok', 'locations', 'saved places', 'mentett helyek'] },
  { path: '/habits', aliases: ['szokasok', 'habits', 'gewohnheiten'] },
  { path: '/obd2', aliases: ['obd', 'obd2', 'obd ii', 'obd diagnosztika'] },
  { path: '/fuel-tracker', aliases: ['uzemanyag', 'tankolas', 'fuel tracker', 'fuel log'] },
  { path: '/voice-help', aliases: ['hangparancs segitseg', 'voice help', 'hangvezerles segitseg'] },
  { path: '/ai-feedback-admin', aliases: ['ai feedback', 'visszajelzes admin', 'feedback admin'] },
  { path: '/system-center', aliases: ['rendszerkozpont', 'rendszer kozpont', 'system center'] },
  { path: '/jelentesek', aliases: ['jelentesek', 'reports', 'berichte', 'rapports'] },
  { path: '/tools/finance', aliases: ['penzugy', 'finance', 'finanzen', 'finances'] },
  { path: '/tools/invoices', aliases: ['szamlak', 'szamlazas', 'invoices', 'rechnungen', 'factures'] },
  { path: '/tools/calendar', aliases: ['naptar', 'calendar', 'kalender', 'calendrier'] },
  { path: '/tools/translate', aliases: ['fordito', 'forditas', 'translate', 'translator', 'ubersetzer'] },
  { path: '/tools/quick', aliases: ['gyors muveletek', 'quick actions', 'schnellaktionen'] },
  { path: '/tools/image-editor', aliases: ['kepszerkeszto', 'kep szerkeszto', 'image editor', 'bildeditor'] },
];

const NAVIGATION_WORDS = [
  'nyisd meg', 'nyisd ki', 'menj', 'menj a', 'ugorj', 'mutasd', 'hozd be',
  'open', 'go to', 'show', 'take me to',
  'offne', 'geh zu', 'ouvre', 'aller a', 'abre', 've a', 'apri', 'vai a'
];

export function resolveVoiceRoute(text = '') {
  const normalized = foldVoiceText(text);
  if (!normalized) return null;

  const exact = VOICE_ROUTE_ALIASES.find(({ aliases }) =>
    aliases.some((alias) => normalized === foldVoiceText(alias))
  );
  if (exact) return exact.path;

  return VOICE_ROUTE_ALIASES.find(({ aliases }) =>
    aliases.some((alias) => normalized.includes(foldVoiceText(alias)))
  )?.path || null;
}

export function isNavigationCommand(text = '') {
  const normalized = foldVoiceText(text);
  return NAVIGATION_WORDS.some((keyword) => normalized.includes(foldVoiceText(keyword)));
}

export function getRecognitionLangFromText(text = '') {
  const normalized = foldVoiceText(text);
  const hungarianSignals = ['nyisd', 'menj', 'ugorj', 'beallitas', 'muszerfal', 'eszkoz', 'fooldal', 'terkep', 'zar'];
  const englishSignals = ['open', 'go to', 'take me to', 'settings', 'dashboard', 'tools', 'home', 'map', 'close'];
  const germanSignals = ['offne', 'geh zu', 'einstellungen', 'werkzeuge', 'startseite'];
  const frenchSignals = ['ouvre', 'aller a', 'parametres', 'outils', 'accueil'];
  const matches = (signals) => signals.some((signal) => normalized.includes(signal));

  if (matches(hungarianSignals)) return 'hu-HU';
  if (matches(englishSignals)) return 'en-US';
  if (matches(germanSignals)) return 'de-DE';
  if (matches(frenchSignals)) return 'fr-FR';
  return null;
}

function extractMapDestination(normalized) {
  const patterns = [
    /^(?:navigalj|vigyel|vezess|utvonal|irany)\s+(?:ide|oda|erre)?\s*(.+)$/i,
    /^(?:navigate to|take me to|directions to)\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

export function resolveGlobalUiCommand(text = '') {
  const normalized = foldVoiceText(text);
  if (!normalized) return null;

  const mapOpen = [
    'nyisd meg a terkepet', 'nyisd ki a terkepet', 'mutasd a terkepet', 'terkep megnyitasa',
    'google maps', 'open map', 'open google maps', 'show map'
  ].some((term) => normalized.includes(term));
  if (mapOpen) return { type:'open_map' };

  const destination = extractMapDestination(normalized);
  if (destination) return { type:'open_map_directions', destination };

  if (['menj vissza', 'lepj vissza', 'vissza', 'go back', 'back'].includes(normalized)) {
    return { type:'history_back' };
  }

  if ([
    'zard be ezt', 'zard be ezt az oldalt', 'zard be az oldalt', 'close this', 'close page', 'close this page'
  ].some((term) => normalized.includes(term))) {
    return { type:'close_view' };
  }

  if (['sotet mod', 'kapcsold be a sotet modot', 'dark mode', 'enable dark mode'].some((term) => normalized.includes(term))) {
    return { type:'set_theme', mode:'dark' };
  }

  if (['vilagos mod', 'kapcsold be a vilagos modot', 'light mode', 'enable light mode'].some((term) => normalized.includes(term))) {
    return { type:'set_theme', mode:'light' };
  }

  if (['rendszer tema', 'automatikus tema', 'system theme', 'system mode'].some((term) => normalized.includes(term))) {
    return { type:'set_theme', mode:'system' };
  }

  if (['csukd ossze a menut', 'csukd be az oldalsavot', 'collapse sidebar', 'close sidebar'].some((term) => normalized.includes(term))) {
    return { type:'sidebar', collapsed:true };
  }

  if (['nyisd ki a menut', 'nyisd ki az oldalsavot', 'expand sidebar', 'open sidebar'].some((term) => normalized.includes(term))) {
    return { type:'sidebar', collapsed:false };
  }

  if (['mikrofon ki', 'kapcsold ki a mikrofont', 'ne figyelj', 'stop listening', 'microphone off'].some((term) => normalized.includes(term))) {
    return { type:'stop_listening' };
  }

  const route = resolveVoiceRoute(normalized);
  if (route && (isNavigationCommand(normalized) || VOICE_ROUTE_ALIASES.some(({ aliases }) => aliases.some((alias) => normalized === foldVoiceText(alias))))) {
    return { type:'navigate_route', path:route };
  }

  return null;
}

export function resolveSettingsAction(text = '') {
  const command = resolveGlobalUiCommand(text);
  if (command?.type === 'set_theme') return { type:'set_theme', mode:command.mode };
  return null;
}

export function executeResolvedGlobalUiCommand(command, { navigate, voice } = {}) {
  if (!command) return { handled:false, reply:'' };

  switch (command.type) {
    case 'navigate_route':
      navigate?.(command.path);
      return { handled:true, reply:'Megnyitottam.' };

    case 'open_map':
      window.open('https://www.google.com/maps', '_blank', 'noopener,noreferrer');
      return { handled:true, reply:'Megnyitottam a térképet.' };

    case 'open_map_directions':
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(command.destination)}`,
        '_blank',
        'noopener,noreferrer'
      );
      return { handled:true, reply:`Navigáció megnyitva: ${command.destination}.` };

    case 'history_back':
      navigate?.(-1);
      return { handled:true, reply:'Visszaléptem.' };

    case 'close_view':
      navigate?.('/');
      return { handled:true, reply:'Bezártam ezt a nézetet.' };

    case 'set_theme': {
      window.dispatchEvent(new CustomEvent('jarvis:voice-theme', { detail:{ mode:command.mode } }));
      return { handled:true, reply:command.mode === 'dark' ? 'Sötét mód bekapcsolva.' : command.mode === 'light' ? 'Világos mód bekapcsolva.' : 'Rendszertéma bekapcsolva.' };
    }

    case 'sidebar':
      window.dispatchEvent(new CustomEvent('jarvis:sidebar-command', { detail:{ collapsed:command.collapsed } }));
      return { handled:true, reply:command.collapsed ? 'Oldalsáv összecsukva.' : 'Oldalsáv kinyitva.' };

    case 'stop_listening':
      voice?.setHandsFree?.(false);
      return { handled:true, reply:'Mikrofon kikapcsolva.', silent:true };

    default:
      return { handled:false, reply:'' };
  }
}
