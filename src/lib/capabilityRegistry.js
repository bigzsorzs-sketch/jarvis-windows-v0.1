const registry = new Map();

const DEFAULT_ROUTES = [
  ['home','/',['főoldal','kezdőlap','fooldal','kezdolap','home','homepage','startseite','accueil']],
  ['chat','/chat',['chat','asszisztens','jarvis chat','assistant','assistent']],
  ['dashboard','/muszerfal',['műszerfal','muszerfal','dashboard','armaturenbrett','tableau de bord']],
  ['memory','/memoria',['memória','memoria','memory','speicher','memoire']],
  ['tools','/eszkozok',['eszközök','eszkozok','eszköztár','eszkoztar','eszköztárat','eszkoztarat','tools','toolbox','werkzeuge','outils']],
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
  {tool:'create_note',category:'productivity',description:'Create a local note',approval:'instant',params:'title?, content'},
  {tool:'create_task',category:'productivity',description:'Create a local task',approval:'instant',params:'title, description?, due_date?, category?'},
  {tool:'create_reminder',category:'productivity',description:'Create a local reminder',approval:'instant',params:'title, description?, due_date?, due_time?, category?'},
  {tool:'create_contact',category:'communication',description:'Create a local contact',approval:'instant',params:'name, phone?, email?, relationship?, notes?'},
  {tool:'search_contacts',category:'communication',description:'Search local contacts',approval:'instant',params:'query'},
  {tool:'search_data',category:'memory',description:'Search local Jarvis data',approval:'instant',params:'query, entity?'},
  {tool:'call_contact',category:'communication',description:'Start a phone call',approval:'confirm',params:'name?, phone?'},
  {tool:'create_invoice',category:'finance',description:'Create a local invoice draft',approval:'confirm',params:'client_name, client_email?, items[{description,quantity,unit_price}], notes?'},
  {tool:'generate_pdf',category:'finance',description:'Generate an invoice PDF',approval:'confirm',params:'invoice_id'},
  {tool:'draft_email',category:'communication',description:'Send via configured Gmail or open a mail draft',approval:'confirm',params:'to, subject?, body?'},
  {tool:'log_blood_sugar',category:'health',description:'Store a blood sugar reading locally',approval:'instant',params:'value, time_of_day?'},
  {tool:'read_latest_blood_sugar',category:'health',description:'Read the latest local blood sugar reading',approval:'instant',params:'none'},
  {tool:'open_map',category:'navigation',description:'Open Google Maps for a requested place or destination',approval:'instant',params:'query?, destination?'},
  {tool:'create_invoice_and_email',category:'finance',description:'Create an invoice draft and send or open its email',approval:'confirm',params:'client_name, client_email, items[{description,quantity,unit_price}], notes?, email_subject?'},
  {tool:'log_meal',category:'health',description:'Store a meal locally',approval:'instant',params:'meal_name, meal_type?, calories?'},
  {tool:'log_finance',category:'finance',description:'Store a finance entry locally',approval:'instant',params:'description, amount, type(income|expense)?, category?'},
  {tool:'control_device',category:'smart-home',description:'Control a physical smart-home device',approval:'confirm',params:'device_name, command(on|off)'},
  {tool:'check_device_status',category:'smart-home',description:'Read smart-home device status',approval:'instant',params:'device_name'},
  {tool:'trigger_scene',category:'smart-home',description:'Trigger a smart-home scene',approval:'confirm',params:'scene_name'},
  {tool:'run_routine',category:'smart-home',description:'Run a smart-home routine',approval:'confirm',params:'routine_name'},
  {tool:'translate_text',category:'language',description:'Translate text',approval:'instant',params:'text, target_language'},
  {tool:'save_memory',category:'memory',description:'Save a local Jarvis memory',approval:'instant',params:'content, category?, importance?'},
  {tool:'analyze_ecosystem',category:'business',description:'Analyze business ecosystem data',approval:'instant',params:'none'},
  {tool:'optimize_workload',category:'business',description:'Analyze workload optimization',approval:'instant',params:'none'},
  {tool:'optimize_revenue',category:'business',description:'Analyze revenue optimization',approval:'instant',params:'none'},
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
    params:String(definition.params || ''),
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

for (const definition of TOOL_DEFINITIONS) {
  registerCapability({
    id:`tool:${definition.tool}`,
    type:'tool',
    category:definition.category,
    title:definition.tool,
    description:definition.description,
    tool:definition.tool,
    approval:definition.approval,
    params:definition.params,
    voiceAliases:[definition.tool.replaceAll('_',' ')],
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
    groups.get(item.category).push(`${item.tool}(${item.params || 'none'}) [${item.approval}]`);
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
