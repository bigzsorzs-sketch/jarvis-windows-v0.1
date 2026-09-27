import { useState } from 'react';
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, Database, ShieldCheck, Save, Upload,
  RefreshCw, Sparkles, Search, MessageSquare, Send, Map, Bug, Loader2
} from 'lucide-react';
import { jarvis } from '@/api/jarvisClient';
import { useLang } from '@/lib/i18n';

function statusClasses(check) {
  if (check.ok) return 'border-green-500/30 bg-green-500/10 text-green-500';
  if (check.severity === 'critical') return 'border-red-500/30 bg-red-500/10 text-red-500';
  return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500';
}

function riskLabel(risk, hu) {
  if (risk === 'high') return hu ? 'Magas' : 'High';
  if (risk === 'medium') return hu ? 'Közepes' : 'Medium';
  return hu ? 'Alacsony' : 'Low';
}

export default function SystemCenter() {
  const { lang } = useLang();
  const hu = lang === 'hu';
  const tx = (hungarian, english) => hu ? hungarian : english;

  const [report, setReport] = useState(null);
  const [repairPlan, setRepairPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [repairBusy, setRepairBusy] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [message, setMessage] = useState('');

  const [projectMap, setProjectMap] = useState(null);
  const [mapBusy, setMapBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [conversation, setConversation] = useState([]);

  const runCheck = async () => {
    if (!window.jarvisDesktop?.runSystemCheck) return;
    setBusy(true); setMessage('');
    try {
      const next = await window.jarvisDesktop.runSystemCheck();
      setReport(next);
      setRepairPlan(await window.jarvisDesktop?.repair?.plan?.(next) || null);
    } catch (error) {
      setMessage(tx('Rendszerellenőrzés hiba: ', 'System check error: ') + (error?.message || error));
    } finally { setBusy(false); }
  };

  const mapProject = async () => {
    setMapBusy(true); setMessage('');
    try {
      const result = await jarvis.functions.invoke('selfRepairMap', { query:chatInput || '' });
      setProjectMap(result?.data?.map || null);
      setMessage(tx('✓ A Jarvis programtérképe elkészült.', '✓ Jarvis project map is ready.'));
    } catch (error) {
      setMessage(tx('Feltérképezési hiba: ', 'Mapping error: ') + (error?.message || error));
    } finally { setMapBusy(false); }
  };

  const sendSelfRepairMessage = async (preset = '') => {
    const content = String(preset || chatInput).trim();
    if (!content || chatBusy) return;
    const userTurn = { role:'user', content };
    const nextHistory = [...conversation, userTurn];
    setConversation(nextHistory);
    setChatInput('');
    setChatBusy(true);
    try {
      const result = await jarvis.functions.invoke('selfRepairChat', {
        message:content,
        language:lang,
        history:nextHistory.slice(-10)
      });
      const data = result?.data || {};
      if (data.map) setProjectMap(data.map);
      setConversation(prev => [...prev, {
        role:'assistant',
        content:data.reply || tx('Nem érkezett elemzés.', 'No analysis returned.'),
        files:data.files || [],
        model:data.model || null
      }]);
    } catch (error) {
      setConversation(prev => [...prev, {
        role:'assistant',
        content:tx('Elemzési hiba: ', 'Analysis error: ') + (error?.message || error)
      }]);
    } finally { setChatBusy(false); }
  };

  const applyRepair = async (repair) => {
    if (!repair?.automatic) return;
    const approved = window.confirm(
      tx('Jarvis ezt a javítást javasolja:\n\n','Jarvis proposes this repair:\n\n') +
      repair.title + '\n' + repair.description +
      tx('\n\nKockázat: ','\n\nRisk: ') + riskLabel(repair.risk, hu) +
      tx('\n\nEngedélyezed a végrehajtást?','\n\nAllow execution?')
    );
    if (!approved) return;
    setRepairBusy(repair.id); setMessage('');
    try {
      const result = await window.jarvisDesktop?.repair?.apply?.(repair.id);
      if (!result?.success) throw new Error(tx('A javítás nem fejeződött be.','Repair did not complete.'));
      setReport(result.report);
      setRepairPlan(result.plan);
      setMessage(tx('✓ Javítás végrehajtva és a rendszer újraellenőrizve.','✓ Repair applied and system rechecked.'));
    } catch (error) {
      setMessage(tx('Javítási hiba: ','Repair error: ') + (error?.message || error));
    } finally { setRepairBusy(''); }
  };

  const createBackup = async () => {
    if (passphrase.length < 8) {
      setMessage(tx('A backup jelszó legalább 8 karakter legyen.','Backup password must be at least 8 characters.'));
      return;
    }
    setBackupBusy(true); setMessage('');
    try {
      const result = await window.jarvisDesktop?.backup?.create(passphrase);
      if (result?.success) setMessage(tx('✓ Mentés elkészült: ','✓ Backup created: ') + result.path);
      else if (result?.canceled) setMessage(tx('Mentés megszakítva.','Backup cancelled.'));
    } catch (error) {
      setMessage(tx('Backup hiba: ','Backup error: ') + (error?.message || error));
    } finally { setBackupBusy(false); }
  };

  const restoreBackup = async () => {
    if (passphrase.length < 8) {
      setMessage(tx('A visszaállításhoz add meg a mentés jelszavát.','Enter the backup password.'));
      return;
    }
    if (!window.confirm(tx('A visszaállítás lecseréli a jelenlegi Jarvis helyi adatbázist. Folytatod?','Restore replaces the current local Jarvis database. Continue?'))) return;
    setBackupBusy(true); setMessage('');
    try {
      const result = await window.jarvisDesktop?.backup?.restore(passphrase);
      if (result?.success) setMessage(tx('✓ Mentés visszaállítva. Indítsd újra a Jarvist.','✓ Backup restored. Restart Jarvis.'));
      else if (result?.canceled) setMessage(tx('Visszaállítás megszakítva.','Restore cancelled.'));
    } catch (error) {
      setMessage(tx('Visszaállítás hiba: ','Restore error: ') + (error?.message || error));
    } finally { setBackupBusy(false); }
  };

  const failedCount = report?.checks?.filter((check) => !check.ok).length || 0;
  const automaticRepairs = repairPlan?.repairs?.filter((repair) => repair.automatic) || [];
  const mapSummary = projectMap?.summary || {};

  return (
    <div className="h-full overflow-y-auto jarvis-scroll">
      <div className="max-w-[1500px] mx-auto px-4 md:px-8 lg:px-10 py-5 md:py-8 space-y-5">
        <section className="app-surface jarvis-command-panel rounded-3xl border border-primary/20 p-5 md:p-7">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="jarvis-core-orb h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"><Activity className="text-primary" size={23} /></div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.24em] text-primary">JARVIS / SELF-REPAIR CORE</p>
                <h1 className="text-2xl md:text-3xl font-bold mt-1">{tx('Rendszerközpont + Ön-javítás','System Center + Self-Repair')}</h1>
                <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
                  {tx(
                    'Jarvis most már feltérképezi a saját programját, összeköti a modulokat és importokat, forráskód alapján keres hibákat, majd konkrét javítási javaslatot és ellenőrzési tervet ad.',
                    'Jarvis maps its own program, connects modules and imports, searches source-aware failure modes, then proposes concrete repairs and validation.'
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={mapProject} disabled={mapBusy} className="px-4 py-3 rounded-xl bg-secondary border border-border font-semibold text-sm flex items-center gap-2 disabled:opacity-60">
                {mapBusy ? <Loader2 size={16} className="animate-spin"/> : <Map size={16}/>}
                {tx('Program feltérképezése','Map program')}
              </button>
              <button onClick={runCheck} disabled={busy} className="px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-2 disabled:opacity-60">
                <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />{busy ? tx('Diagnosztika...','Diagnostics...') : tx('Diagnosztika indítása','Run diagnostics')}
              </button>
            </div>
          </div>

          {projectMap && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-5">
              <div className="jarvis-metric"><span>{tx('Forrásfájl','Source files')}</span><strong>{mapSummary.sourceFiles ?? '-'}</strong></div>
              <div className="jarvis-metric"><span>{tx('Teszt','Tests')}</span><strong>{mapSummary.tests ?? '-'}</strong></div>
              <div className="jarvis-metric"><span>{tx('Import kapcsolat','Import links')}</span><strong>{mapSummary.imports ?? '-'}</strong></div>
              <div className="jarvis-metric"><span>{tx('Feltárt jelzés','Static findings')}</span><strong>{projectMap.findings?.length ?? 0}</strong></div>
            </div>
          )}

          {report && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="jarvis-metric"><span>{tx('Állapot','Status')}</span><strong>{report.ok ? tx('STABIL','STABLE') : tx('FIGYELEM','ATTENTION')}</strong></div>
              <div className="jarvis-metric"><span>{tx('Eltérés','Issues')}</span><strong>{failedCount}</strong></div>
              <div className="jarvis-metric"><span>{tx('Auto-javítás','Auto repair')}</span><strong>{automaticRepairs.length}</strong></div>
            </div>
          )}
        </section>

        <section className="app-surface rounded-3xl p-5 md:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><MessageSquare size={19} className="text-primary"/></div>
              <div>
                <h2 className="font-semibold">{tx('Self-Repair párbeszéd','Self-Repair conversation')}</h2>
                <p className="text-xs text-muted-foreground">{tx('Kérdezz rá bármely hibára vagy modulra. Jarvis a releváns saját forráskódját és programtérképét használja a válaszhoz.','Ask about any bug or module. Jarvis uses its relevant source code and project map to answer.')}</p>
              </div>
            </div>
            <button
              onClick={()=>sendSelfRepairMessage(tx('Térképezd fel a programot, keress lehetséges hibákat és sorold a legfontosabb javítási javaslatokat.','Map the program, find likely bugs and list the most important repair proposals.'))}
              disabled={chatBusy}
              className="rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              <Bug size={14}/>{tx('Hibák keresése','Find bugs')}
            </button>
          </div>

          <div className="min-h-[220px] max-h-[430px] overflow-y-auto rounded-2xl border border-border bg-background/60 p-3 space-y-3">
            {conversation.length === 0 && (
              <div className="text-sm text-muted-foreground p-3">
                {tx('Például: „Miért nem működik a világos mód?”, „Nézd át a mikrofon folyamatot”, vagy „Melyik rész a leginkább hibára hajlamos?”','For example: “Why does light mode fail?”, “Inspect the microphone flow”, or “Which part is most error-prone?”')}
              </div>
            )}
            {conversation.map((turn,index)=>(
              <div key={index} className={turn.role === 'user' ? 'ml-auto max-w-[86%] rounded-2xl bg-primary text-primary-foreground px-4 py-3' : 'mr-auto max-w-[92%] rounded-2xl border border-border bg-card px-4 py-3'}>
                <p className="text-[10px] uppercase tracking-wider opacity-70 mb-1">{turn.role === 'user' ? tx('Te','You') : 'Jarvis Self-Repair'}</p>
                <div className="text-sm whitespace-pre-wrap">{turn.content}</div>
                {turn.files?.length > 0 && <div className="mt-2 text-[10px] text-muted-foreground">{tx('Vizsgált fájlok: ','Inspected files: ')}{turn.files.slice(0,8).join(', ')}</div>}
                {turn.model && <div className="mt-1 text-[10px] text-muted-foreground">{tx('Elemző modell: ','Analysis model: ')}{turn.model}</div>}
              </div>
            ))}
            {chatBusy && <div className="mr-auto rounded-2xl border border-border bg-card px-4 py-3 text-sm flex items-center gap-2"><Loader2 size={15} className="animate-spin"/>{tx('Forráskód elemzése...','Analyzing source...')}</div>}
          </div>

          <div className="mt-3 flex gap-2">
            <textarea
              value={chatInput}
              onChange={e=>setChatInput(e.target.value)}
              onKeyDown={e=>{
                if(e.key === 'Enter' && !e.shiftKey){
                  e.preventDefault();
                  sendSelfRepairMessage();
                }
              }}
              rows={2}
              placeholder={tx('Írj a Self-Repairnek...','Message Self-Repair...')}
              className="flex-1 rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none resize-none"
            />
            <button onClick={()=>sendSelfRepairMessage()} disabled={chatBusy || !chatInput.trim()} className="rounded-xl bg-primary text-primary-foreground px-4 flex items-center justify-center disabled:opacity-50" aria-label={tx('Küldés','Send')}>
              <Send size={18}/>
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            {tx(
              'A Self-Repair olvassa és értelmezi a Jarvis forrását, de nem írja át magát automatikusan. A tényleges kódmódosítás továbbra is sandbox + teszt + tulajdonosi jóváhagyás után történhet.',
              'Self-Repair reads and interprets Jarvis source, but does not rewrite itself automatically. Actual changes still require sandboxing, tests and owner approval.'
            )}
          </p>
        </section>

        {projectMap?.findings?.length > 0 && (
          <section className="app-surface rounded-3xl p-5 md:p-6">
            <div className="flex items-center gap-3 mb-3"><Search size={18} className="text-primary"/><h2 className="font-semibold">{tx('Automatikus forrásjelzések','Automatic source findings')}</h2></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {projectMap.findings.map((finding,index)=>(
                <div key={index} className="rounded-xl border border-border bg-background/60 p-3">
                  <div className="text-xs font-semibold text-foreground">{finding.title}</div>
                  <div className="text-xs text-muted-foreground mt-1 break-words">{finding.detail}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {report && <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {report.checks.map((check) => {
            const Icon = check.ok ? CheckCircle2 : check.severity === 'critical' ? XCircle : AlertTriangle;
            return <div key={check.id} className={'rounded-2xl border p-4 backdrop-blur-xl ' + statusClasses(check)}>
              <div className="flex items-start gap-3"><Icon size={18} className="mt-0.5 shrink-0" /><div className="min-w-0"><p className="text-sm font-semibold text-foreground">{check.label}</p><p className="text-xs mt-1 opacity-80 break-words">{check.detail}</p></div></div>
            </div>;
          })}
        </section>}

        {repairPlan?.repairs?.length > 0 && (
          <section className="app-surface rounded-3xl p-5 md:p-6">
            <div className="flex items-center gap-3 mb-4"><Sparkles size={19} className="text-primary"/><h2 className="font-semibold">{tx('Biztonságos javítási terv','Safe repair plan')}</h2></div>
            <div className="space-y-3">
              {repairPlan.repairs.map(repair=>(
                <div key={repair.id} className="rounded-2xl border border-border bg-background/50 p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                  <div><h3 className="text-sm font-semibold">{repair.title}</h3><p className="text-xs text-muted-foreground mt-1">{repair.description}</p><p className="text-[10px] text-muted-foreground mt-2">{tx('Kockázat: ','Risk: ')}{riskLabel(repair.risk,hu)}</p></div>
                  {repair.automatic ? (
                    <button onClick={()=>applyRepair(repair)} disabled={repairBusy===repair.id} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold disabled:opacity-50">
                      {repairBusy===repair.id ? tx('Javítás...','Repairing...') : tx('Javítás engedélyezése','Approve repair')}
                    </button>
                  ) : <span className="text-xs text-muted-foreground">{tx('Kézi lépés szükséges','Manual action required')}</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="app-surface rounded-3xl p-5 md:p-6">
            <div className="flex items-center gap-3 mb-3"><Database size={19} className="text-primary"/><div><h2 className="font-semibold">{tx('Natív helyi adatbázis','Native local database')}</h2><p className="text-xs text-muted-foreground">SQLite + WAL</p></div></div>
            <p className="text-sm text-muted-foreground">{tx('A Jarvis rekordjai helyi SQLite adatbázisban maradnak.','Jarvis records remain in the local SQLite database.')}</p>
          </div>
          <div className="app-surface rounded-3xl p-5 md:p-6">
            <div className="flex items-center gap-3 mb-3"><ShieldCheck size={19} className="text-primary"/><div><h2 className="font-semibold">{tx('Jelszavas Jarvis Backup','Password-protected Jarvis Backup')}</h2><p className="text-xs text-muted-foreground">AES-256-GCM · PBKDF2-SHA256</p></div></div>
            <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder={tx('Backup jelszó (minimum 8 karakter)','Backup password (minimum 8 characters)')} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              <button onClick={createBackup} disabled={backupBusy} className="rounded-xl bg-secondary border border-border px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"><Save size={15}/>{tx('Mentés készítése','Create backup')}</button>
              <button onClick={restoreBackup} disabled={backupBusy} className="rounded-xl bg-secondary border border-border px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"><Upload size={15}/>{tx('Mentés visszaállítása','Restore backup')}</button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">{tx('A jelszó nincs eltárolva. Az API-kulcsok nem kerülnek a backupba.','The password is not stored. API keys are excluded from the backup.')}</p>
          </div>
        </section>

        {message && <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary break-words">{message}</div>}
      </div>
    </div>
  );
}
