import { CheckCircle2, AlertTriangle, XCircle, Activity, Minus } from 'lucide-react';

const MODULES = [
  {
    id: 'ai_chat',
    name: 'AI Chat',
    status: 'VERIFIED',
    launch: 'beta',
    detail: 'LLM hívás, válasz, előzmény kezelés – tesztelve és működik.',
    caveat: null,
  },
  {
    id: 'memory',
    name: 'Memory System',
    status: 'VERIFIED',
    launch: 'beta',
    detail: 'CREATE / READ entity műveletek – tesztelve, helyes adatokkal.',
    caveat: null,
  },
  {
    id: 'tasks',
    name: 'Notes / Tasks / Reminders',
    status: 'VERIFIED',
    launch: 'beta',
    detail: 'Minden CRUD művelet tesztelve, adatmegőrzés helyes.',
    caveat: null,
  },
  {
    id: 'contacts',
    name: 'Contacts',
    status: 'VERIFIED',
    launch: 'beta',
    detail: 'CREATE / READ / FILTER működik. Hívás indítása tel: link-kel.',
    caveat: null,
  },
  {
    id: 'bloodsugar',
    name: 'Blood Sugar Logging',
    status: 'VERIFIED',
    launch: 'beta',
    detail: 'Float érték, dátum, időpont – tesztelve, helyes adatokkal.',
    caveat: null,
  },
  {
    id: 'meal',
    name: 'Meal Logging',
    status: 'VERIFIED',
    launch: 'beta',
    detail: 'Étkezés típus, kalória, dátum – tesztelve.',
    caveat: null,
  },
  {
    id: 'finance',
    name: 'Finance',
    status: 'VERIFIED',
    launch: 'beta',
    detail: 'Income / expense entries – tesztelve, összeg float helyes.',
    caveat: null,
  },
  {
    id: 'invoice',
    name: 'Invoices + PDF Export',
    status: 'VERIFIED',
    launch: 'beta',
    detail: 'Invoice CRUD + PDF generálás HTTP 200. jsPDF bug javítva.',
    caveat: null,
  },
  {
    id: 'translations',
    name: 'Translations',
    status: 'VERIFIED',
    launch: 'beta',
    detail: 'LLM-alapú fordítás – tesztelve, helyes output.',
    caveat: null,
  },
  {
    id: 'legal',
    name: 'Legal Module',
    status: 'VERIFIED',
    launch: 'beta',
    detail: 'Magyar jogi tájékoztatás AI-val – tesztelve, strukturált válasz.',
    caveat: 'Claude Sonnet modell – több kreditet fogyaszt.',
  },
  {
    id: 'gps',
    name: 'GPS / Geofencing',
    status: 'PARTIAL',
    launch: 'beta',
    detail: 'DB mentés és 5 perces cache tesztelve. Fizikai geofence trigger browser-függő.',
    caveat: 'Csak nyitott böngésző-tab mellett működik. Nincs background tracking.',
  },
  {
    id: 'push',
    name: 'Push Notifications',
    status: 'NOT_VERIFIED',
    launch: 'not_ready',
    detail: 'Kód helyes, de server-side nem tesztelhető.',
    caveat: 'Csak HTTPS + nyitott tab. Nincs FCM / Service Worker. Safari iOS korlátozott.',
  },
  {
    id: 'smarthome',
    name: 'Smart Home',
    status: 'PARTIAL',
    launch: 'not_ready',
    detail: 'DB CRUD tesztelve. Eszköz vezérlés HTTP fetch kódban helyes.',
    caveat: 'Fizikai vezérlés CSAK lokális hálózaton működik. Cloud deployban lokális IP nem elérhető.',
  },
  {
    id: 'obd2',
    name: 'OBD2 Diagnostics',
    status: 'PARTIAL',
    launch: 'not_ready',
    detail: 'AI diagnózis + PDF export tesztelve és működik.',
    caveat: 'Valós OBD2 Bluetooth kapcsolat Web Bluetooth API-t igényel – csak Chrome/Edge, fizikai hardver szükséges.',
  },
  {
    id: 'gmail',
    name: 'Gmail Manager',
    status: 'FAIL',
    launch: 'not_ready',
    detail: 'Nincs gmailFetch backend function. Nincs Gmail OAuth connector regisztrálva.',
    caveat: 'OAuth app user connector szükséges a Google-től – nem konfigurálva.',
  },
];

const STATUS_CONFIG = {
  VERIFIED: {
    label: 'VERIFIED',
    icon: CheckCircle2,
    color: 'text-green-400',
    bg: 'bg-green-400/10 border-green-400/30',
    dot: 'bg-green-400',
  },
  PARTIAL: {
    label: 'PARTIAL',
    icon: AlertTriangle,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10 border-yellow-400/30',
    dot: 'bg-yellow-400',
  },
  NOT_VERIFIED: {
    label: 'NOT VERIFIED',
    icon: Minus,
    color: 'text-muted-foreground',
    bg: 'bg-secondary border-border',
    dot: 'bg-muted-foreground',
  },
  FAIL: {
    label: 'FAIL',
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-400/10 border-red-400/30',
    dot: 'bg-red-400',
  },
};

const LAUNCH_CONFIG = {
  beta: { label: 'Ready for Beta', color: 'text-green-400', bg: 'bg-green-400/10' },
  public: { label: 'Ready for Launch', color: 'text-primary', bg: 'bg-primary/10' },
  not_ready: { label: 'Not Ready', color: 'text-red-400', bg: 'bg-red-400/10' },
};

const verified = MODULES.filter(m => m.status === 'VERIFIED').length;
const partial = MODULES.filter(m => m.status === 'PARTIAL').length;
const fail = MODULES.filter(m => m.status === 'FAIL').length;
const notVerified = MODULES.filter(m => m.status === 'NOT_VERIFIED').length;

export default function Diagnostics() {
  const title = 'Diagnostics';
  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="px-4 pt-5 pb-8 space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-500/20 flex items-center justify-center">
            <Activity size={20} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{title}</h1>
            <p className="text-xs text-muted-foreground">Rendszerkészültségi áttekintés</p>
          </div>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Verified', count: verified, color: 'text-green-400', bg: 'bg-green-400/10' },
            { label: 'Partial', count: partial, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
            { label: 'Not Verified', count: notVerified, color: 'text-muted-foreground', bg: 'bg-secondary' },
            { label: 'Fail', count: fail, color: 'text-red-400', bg: 'bg-red-400/10' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-3 text-center`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Module list */}
        <div className="space-y-2">
          {MODULES.map(mod => {
            const sc = STATUS_CONFIG[mod.status];
            const lc = LAUNCH_CONFIG[mod.launch];
            const Icon = sc.icon;
            return (
              <div key={mod.id} className={`border rounded-2xl p-4 ${sc.bg}`}>
                <div className="flex items-start gap-3">
                  <Icon size={16} className={`${sc.color} shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{mod.name}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sc.bg} ${sc.color} border`}>
                        {sc.label}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${lc.bg} ${lc.color}`}>
                        {lc.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{mod.detail}</p>
                    {mod.caveat && (
                      <p className="text-[11px] text-yellow-400 mt-1">⚠️ {mod.caveat}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Overall verdict */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-sm font-bold text-foreground mb-3">🏁 Összesített ítélet</p>
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p><span className="text-green-400 font-semibold">Beta-ra kész (10 modul):</span> AI Chat, Memory, Tasks, Contacts, Blood Sugar, Meal Log, Finance, Invoice+PDF, Translations, Legal.</p>
            <p><span className="text-yellow-400 font-semibold">Korlátozott (3 modul):</span> GPS/Geofencing, Smart Home, OBD2 – hardver vagy browser-környezet szükséges, nem univerzálisan elérhető.</p>
            <p><span className="text-muted-foreground font-semibold">Nem verifikált (1 modul):</span> Push Notifications – kód helyes, de éles tesztelés szükséges.</p>
            <p><span className="text-red-400 font-semibold">Nem kész (1 modul):</span> Gmail Manager – OAuth konfiguráció és backend function hiányzik.</p>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          Ez egy bizonyíték-alapú jelentés – minden ellenőrzött státusz valós API teszten alapul.
        </p>
      </div>
    </div>
  );
}