const registry = new Map();

const DEFAULT_ROUTES = [
  ['home','/',['főoldal','kezdőlap','fooldal','kezdolap','home','homepage','startseite','accueil']],
  ['chat','/chat',['chat','asszisztens','jarvis chat','assistant','assistent']],
  ['dashboard','/muszerfal',['műszerfal','muszerfal','dashboard','armaturenbrett','tableau de bord']],
  ['memory','/memoria',['memória','memoria','memory','speicher','memoire']],
  ['tools','/eszkozok',['eszközök','eszkozok','tools','werkzeuge','outils']],
  ['settings','/beallitasok',['beállítások','beallitasok','beállítás','beallitas','settings','einstellungen','parametres']],
  ['contacts','/contacts',['kapcsolatok','kontaktok','contacts','kontakte']],
  ['reminders','/reminders',['emlékeztetők','emlekeztetok','feladatok','tasks','reminders','erinnerungen','rappels']],
  ['smart-home','/smarthome',['okosotthon','okos otthon','smart home','smarthome','maison intelligente']],
  ['routines','/routines',['rutinok','routines','routinen']],
  ['holding','/holding',['holding','cégek','cegek','vállalkozások','vallalkozasok','businesses']],
  ['legal','/legal',['jog','jogi','legal','recht','juridique']],
  ['privacy','/privacy-terms',['adatvédelem','adatvedelem','privacy','privacy terms','feltételek','feltetelek']],
  ['release-checklist','/release-checklist',['release checklist','kiadás ellenőrzés','kiadas ellenorzes','kiadási lista','kiadasi lista']],
  ['automotive','/automotive',['autó diagnosztika','auto diagnosztika','autodiagnosztika','automotive','car diagnostics']],
  ['retail','/retail',['retail','bolt','üzlet','uzlet','store','shop']],
  ['gmail','/gmail',['gmail','emailek','email','levelek','mail']],
  ['locations','/locations',['helyek','lokációk','lokaciok','locations','saved places','mentett helyek']],
  ['habits','/habits',['szokások','szokasok','habits','gewohnheiten']],
  ['obd2','/obd2',['obd','obd2','obd ii','obd diagnosztika']],
  ['fuel-tracker','/fuel-tracker',['üzemanyag','uzemanyag','tankolás','tankolas','fuel tracker','fuel log']],
  ['voice-help','/voice-help',['hangparancs segítség','hangparancs segitseg','voice help','hangvezérlés segítség','hangvezerles segitseg']],
  ['ai-feedback','/ai-feedback-admin',['ai feedback','visszajelzés admin','visszajelzes admin','feedback admin']],
  ['system-center','/system-center',['rendszerközpont','rendszerkozpont','rendszer központ','rendszer kozpont','system center']],
  ['reports','/jelentesek',['jelentések','jelentesek','reports','berichte','rapports']],
  ['finance','/tools/finance',['pénzügy','penzugy','finance','finanzen','finances']],
  ['invoices','/tools/invoices',['számlák','szamlak','számlázás','szamlazas','invoices','rechnungen','factures']],
  ['calendar','/tools/calendar',['naptár','naptar','calendar','kalender','calendrier']],
  ['translate','/tools/translate',['fordító','fordito','fordítás','forditas','translate','translator','ubersetzer']],
  ['quick-actions','/tools/quick',['gyors műveletek','gyors muveletek','quick actions','schnellaktionen']],
  ['image-editor','/tools/image-editor',['képszerkesztő','kepszerkeszto','kép szerkesztő','kep szerkeszto','image editor','bildeditor']],
];

const TOOL_DEFINITIONS = [
  ['create_note','productivity','Create a local note','instant'],
  ['create_task','productivity','Create a local task','instant'],
  ['create_reminder','productivity','Create a local reminder','instant'],
  ['create_contact','communication','Create a local contact','instant'],
  ['search_contacts','communication','Search local contacts','instant'],
  ['search_data','memory','Search local Jarvis data','instant'],
  ['call_contact','communication','Start a phone call','confirm'],
  ['create_invoice','finance','Create a local invoice draft','instant'],
  ['generate_pdf','finance','Generate an invoice PDF','instant'],
  ['draft_email','communication','Send or open an email draft','confirm'],
  ['log_blood_sugar','health','Store a blood sugar reading locally','instant'],
  ['log_meal','health','Store a meal locally','instant'],
  ['log_finance','finance','Store a finance entry locally','instant'],
  ['control_device','smart-home','Control a physical smart-home device','confirm'],
  ['check_device_status','smart-home','Read smart-home device status','instant'],
  ['trigger_scene','smart-home','Trigger a smart-home scene','confirm'],
  ['run_routine','smart-home','Run a smart-home routine','confirm'],
  ['translate_text','language','Translate text','instant'],
  ['save_memory','memory','Save a local Jarvis memory','instant'],
  ['analyze_ecosystem','business','Analyze business ecosystem data','instant'],
  ['optimize_workload','business','Analyze workload optimization','instant'],
  ['optimize_revenue','business','Analyze revenue optimization','instant'],
];

export function registerCapability(definition = {}) {
  const id = String(definition.id || '').trim();
  if (!id) throw new Error('CAPABILITY_ID_REQUIRED');
  const normalized = {
    id,
    type:definition.type || 'tool',
    category:definition.category || 'general',
    title:definition.title || id,
    description:definition.description || '',
    approval:['instant','confirm','owner'].includes(definition.approval) ? definition.approval : 'instant',
    route:definition.route || null,
    tool:definition.tool || null,
    voiceAliases:Array.isArray(definition.voiceAliases) ? [...new Set(definition.voiceAliases.filter(Boolean).map(String))] : [],
    enabled:definition.enabled !== false,
  };
  registry.set(id, normalized);
  return normalized;
}

for (const [id, route, aliases] of DEFAULT_ROUTES) {
  registerCapability({
    id:`route:${id}`,
    type:'route',
    category:'navigation',
    title:id,
    route,
    approval:'instant',
    voiceAliases:aliases,
  });
}

for (const [tool, category, description, approval] of TOOL_DEFINITIONS) {
  registerCapability({
    id:`tool:${tool}`,
    type:'tool',
    category,
    title:tool,
    description,
    tool,
    approval,
    voiceAliases:[tool.replaceAll('_',' ')],
  });
}

export function getCapability(idOrTool='') {
  const key = String(idOrTool || '');
  return registry.get(key) || registry.get(`tool:${key}`) || null;
}

export function listCapabilities({ type=null, enabledOnly=true }={}) {
  return [...registry.values()].filter((item) =>
    (!type || item.type === type) && (!enabledOnly || item.enabled)
  );
}

export function listToolCapabilities() {
  return listCapabilities({type:'tool'});
}

export function listRouteCapabilities() {
  return listCapabilities({type:'route'});
}

export function getVoiceRouteAliases() {
  return listRouteCapabilities().map((item) => ({ path:item.route, aliases:item.voiceAliases, capabilityId:item.id }));
}

export function buildCapabilityPrompt() {
  const groups = new Map();
  for (const item of listToolCapabilities()) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(`${item.tool} [${item.approval}]`);
  }
  return [...groups.entries()]
    .map(([category, tools]) => `[${category.toUpperCase()}] ${tools.join(', ')}`)
    .join('\n');
}

export function syncDiscoveredTools(toolNames=[]) {
  for (const rawName of toolNames) {
    const tool = String(rawName || '').trim();
    if (!tool || registry.has(`tool:${tool}`)) continue;
    registerCapability({
      id:`tool:${tool}`,
      type:'tool',
      category:'discovered',
      title:tool,
      description:'Auto-discovered Jarvis capability. Owner approval is required until explicitly classified.',
      tool,
      approval:'owner',
      voiceAliases:[tool.replaceAll('_',' ')],
    });
  }
  return listToolCapabilities();
}

export function getApprovalMode(tool='') {
  return getCapability(tool)?.approval || 'owner';
}

export function capabilityRegistrySnapshot() {
  return listCapabilities().map((item) => ({...item}));
}
