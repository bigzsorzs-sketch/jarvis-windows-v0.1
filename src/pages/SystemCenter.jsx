import { useState } from 'react';
import { Activity, CheckCircle2, XCircle, AlertTriangle, Database, ShieldCheck, Save, Upload, RefreshCw, Wrench, Sparkles, LockKeyhole, Search } from 'lucide-react';
import { invokeWithRetry } from '@/lib/llmGateway';

function statusClasses(check) {
  if (check.ok) return 'border-green-500/30 bg-green-500/10 text-green-400';
  if (check.severity === 'critical') return 'border-red-500/30 bg-red-500/10 text-red-400';
  return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400';
}

function riskLabel(risk) {
  if (risk === 'high') return 'Magas';
  if (risk === 'medium') return 'Közepes';
  return 'Alacsony';
}

export default function SystemCenter() {
  const [report, setReport] = useState(null);
  const [repairPlan, setRepairPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [repairBusy, setRepairBusy] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [message, setMessage] = useState('');
  const [repairRequest, setRepairRequest] = useState('');
  const [repairAnalysis, setRepairAnalysis] = useState('');
  const [requestBusy, setRequestBusy] = useState(false);

  const runCheck = async () => {
    if (!window.jarvisDesktop?.runSystemCheck) return;
    setBusy(true); setMessage('');
    try {
      const next = await window.jarvisDesktop.runSystemCheck();
      setReport(next);
      setRepairPlan(await window.jarvisDesktop?.repair?.plan?.(next) || null);
    } catch (error) {
      setMessage('Rendszerellenőrzés hiba: ' + (error?.message || error));
    } finally { setBusy(false); }
  };

  const applyRepair = async (repair) => {
    if (!repair?.automatic) return;
    const approved = window.confirm(
      'Jarvis ezt a javítást javasolja:\n\n' + repair.title + '\n' + repair.description +
      '\n\nKockázat: ' + riskLabel(repair.risk) + '\n\nEngedélyezed a végrehajtást?'
    );
    if (!approved) return;
    setRepairBusy(repair.id); setMessage('');
    try {
      const result = await window.jarvisDesktop?.repair?.apply?.(repair.id);
      if (!result?.success) throw new Error('A javítás nem fejeződött be.');
      setReport(result.report);
      setRepairPlan(result.plan);
      setMessage('✓ Javítás végrehajtva és a rendszer újraellenőrizve.');
    } catch (error) {
      setMessage('Javítási hiba: ' + (error?.message || error));
    } finally { setRepairBusy(''); }
  };

  const createBackup = async () => {
    if (passphrase.length < 8) { setMessage('A backup jelszó legalább 8 karakter legyen.'); return; }
    setBackupBusy(true); setMessage('');
    try {
      const result = await window.jarvisDesktop?.backup?.create(passphrase);
      if (result?.success) setMessage('✓ Mentés elkészült: ' + result.path);
      else if (result?.canceled) setMessage('Mentés megszakítva.');
    } catch (error) { setMessage('Backup hiba: ' + (error?.message || error)); }
    finally { setBackupBusy(false); }
  };

  const restoreBackup = async () => {
    if (passphrase.length < 8) { setMessage('A visszaállításhoz add meg a mentés jelszavát.'); return; }
    if (!window.confirm('A visszaállítás lecseréli a jelenlegi Jarvis helyi adatbázist. Folytatod?')) return;
    setBackupBusy(true); setMessage('');
    try {
      const result = await window.jarvisDesktop?.backup?.restore(passphrase);
      if (result?.success) setMessage('✓ Mentés visszaállítva. Indítsd újra a Jarvist az összes nézet frissítéséhez.');
      else if (result?.canceled) setMessage('Visszaállítás megszakítva.');
    } catch (error) {
      setMessage('Visszaállítás hiba: ' + (error?.message === 'BACKUP_PASSWORD_INVALID' ? 'Hibás backup jelszó vagy sérült mentés.' : (error?.message || error)));
    } finally { setBackupBusy(false); }
  };

  const analyzeRepairRequest = async () => {
    const request = repairRequest.trim();
    if (!request) return;
    setRequestBusy(true); setRepairAnalysis('');
    try {
      const result = await invokeWithRetry({
        prompt: `Te a Jarvis Windows alkalmazás diagnosztikai asszisztense vagy. A tulajdonos ezt kéri: "${request}".
Készíts rövid magyar diagnosztikai tervet. Pontosan írd le:
1. mit kell ellenőrizni,
2. melyik Jarvis alrendszer érintett,
3. milyen teszttel igazolható a javítás,
4. van-e kockázat.
Ne állítsd, hogy kódot módosítottál. A tényleges forrásmódosítás csak izolált sandboxban és tulajdonosi jóváhagyással történhet.`,
        task_type:'repair',
        queueKey:'system-repair-request'
      }, 1);
      const text = result?.data?.result ?? result?.data ?? result;
      setRepairAnalysis(typeof text === 'string' ? text : JSON.stringify(text, null, 2));
    } catch (error) {
      setRepairAnalysis('Elemzési hiba: ' + (error?.message || error));
    } finally { setRequestBusy(false); }
  };

  const failedCount = report?.checks?.filter((check) => !check.ok).length || 0;
  const automaticRepairs = repairPlan?.repairs?.filter((repair) => repair.automatic) || [];

  return (
    <div className="h-full overflow-y-auto jarvis-scroll">
      <div className="max-w-[1500px] mx-auto px-4 md:px-8 lg:px-10 py-5 md:py-8 space-y-5">
        <section className="app-surface jarvis-command-panel rounded-3xl border border-primary/20 p-5 md:p-7">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="jarvis-core-orb h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"><Activity className="text-primary" size={23} /></div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.24em] text-primary">JARVIS / SYSTEM CORE</p>
                <h1 className="text-2xl md:text-3xl font-bold mt-1">System Center + Self-Repair</h1>
                <p className="text-sm text-muted-foreground mt-2 max-w-2xl">Jarvis ellenőrzi a helyi rendszert, javítási tervet készít, és csak a te kifejezett engedélyeddel hajt végre biztonságos javítást.</p>
              </div>
            </div>
            <button onClick={runCheck} disabled={busy} className="px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />{busy ? 'Diagnosztika...' : 'Diagnosztika indítása'}
            </button>
          </div>
          {report && (
            <div className="grid grid-cols-3 gap-2 mt-5">
              <div className="jarvis-metric"><span>Állapot</span><strong>{report.ok ? 'STABIL' : 'FIGYELEM'}</strong></div>
              <div className="jarvis-metric"><span>Eltérés</span><strong>{failedCount}</strong></div>
              <div className="jarvis-metric"><span>Auto-javítás</span><strong>{automaticRepairs.length}</strong></div>
            </div>
          )}
        </section>

        {report && <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {report.checks.map((check) => {
            const Icon = check.ok ? CheckCircle2 : check.severity === 'critical' ? XCircle : AlertTriangle;
            return <div key={check.id} className={'rounded-2xl border p-4 backdrop-blur-xl ' + statusClasses(check)}>
              <div className="flex items-start gap-3"><Icon size={18} className="mt-0.5 shrink-0" /><div className="min-w-0"><p className="text-sm font-semibold text-foreground">{check.label}</p><p className="text-xs mt-1 opacity-80 break-words">{check.detail}</p></div></div>
            </div>;
          })}
        </section>}

        <section className="app-surface rounded-3xl p-5 md:p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><Wrench size={19} className="text-primary" /></div>
            <div><h2 className="font-semibold">Mit ellenőrizzek vagy javítsak?</h2><p className="text-xs text-muted-foreground">Írd le saját szavaiddal a hibát vagy az ellenőrizendő működést.</p></div>
          </div>
          <textarea value={repairRequest} onChange={e=>setRepairRequest(e.target.value)} rows={4}
            placeholder="Példa: A világos mód kapcsoló nem működik. Keresd meg az okát és készíts javítási tervet."
            className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none resize-y" />
          <button onClick={analyzeRepairRequest} disabled={requestBusy || !repairRequest.trim()}
            className="mt-3 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
            <Search size={15}/>{requestBusy?'Elemzés...':'Vizsgálat indítása'}
          </button>
          {repairAnalysis && <div className="mt-3 rounded-xl bg-background/60 border border-border p-3 text-sm whitespace-pre-wrap">{repairAnalysis}</div>}
          <p className="text-[11px] text-muted-foreground mt-3">A diagnózis nem írja át közvetlenül a Jarvist. Forrásmódosítás csak sandbox-ellenőrzés és külön tulajdonosi jóváhagyás után engedélyezhető.</p>
        </section>

        {repairPlan?.repairs?.length > 0 && (
          <section className="app-surface rounded-3xl p-5 md:p-6">
            <div className="flex items-center gap-3 mb-4"><div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><Sparkles size={19} className="text-primary" /></div><div><h2 className="font-semibold">Önjavító javaslatok</h2><p className="text-xs text-muted-foreground">Észlelés → javítási terv → jóváhagyás → végrehajtás → újraellenőrzés</p></div></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {repairPlan.repairs.map((repair) => <div key={repair.id} className="rounded-2xl border border-primary/15 bg-background/45 p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-sm">{repair.title}</p><p className="text-xs text-muted-foreground mt-1 leading-relaxed">{repair.description}</p></div><span className="text-[10px] rounded-full border border-border px-2 py-1 whitespace-nowrap">{riskLabel(repair.risk)}</span></div>
                {repair.automatic ? <button onClick={() => applyRepair(repair)} disabled={Boolean(repairBusy)} className="mt-3 w-full rounded-xl bg-primary/15 border border-primary/25 text-primary px-3 py-2.5 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"><Wrench size={14}/>{repairBusy === repair.id ? 'Javítás...' : 'Javítás engedélyezése'}</button> : <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole size={13}/>Automatikus módosítás tiltva – kézi ellenőrzés szükséges.</div>}
              </div>)}
            </div>
          </section>
        )}

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-3xl border border-border bg-card/80 backdrop-blur-xl p-5 md:p-6">
            <div className="flex items-center gap-3 mb-4"><div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><Database size={19} className="text-primary" /></div><div><h2 className="font-semibold">Natív helyi adatbázis</h2><p className="text-xs text-muted-foreground">SQLite + WAL · helyi, offline és migrálható</p></div></div>
            <p className="text-sm text-muted-foreground leading-relaxed">A Windows Jarvis az alkalmazás rekordjait natív SQLite adatbázisban tárolja. Az önjavító motor nem írhat tetszőleges kódot vagy adatot: csak a beépített, engedélyezett javításokat futtathatja.</p>
          </div>
          <div className="rounded-3xl border border-border bg-card/80 backdrop-blur-xl p-5 md:p-6">
            <div className="flex items-center gap-3 mb-4"><div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><ShieldCheck size={19} className="text-primary" /></div><div><h2 className="font-semibold">Jelszavas Jarvis Backup</h2><p className="text-xs text-muted-foreground">AES-256-GCM · PBKDF2-SHA256</p></div></div>
            <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="Backup jelszó (minimum 8 karakter)" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              <button onClick={createBackup} disabled={backupBusy} className="rounded-xl bg-secondary border border-border px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"><Save size={15}/>Mentés készítése</button>
              <button onClick={restoreBackup} disabled={backupBusy} className="rounded-xl bg-secondary border border-border px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"><Upload size={15}/>Mentés visszaállítása</button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">A jelszó nincs eltárolva. Az API-kulcsok nem kerülnek a backupba.</p>
          </div>
        </section>

        {message && <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary break-words">{message}</div>}
      </div>
    </div>
  );
}
