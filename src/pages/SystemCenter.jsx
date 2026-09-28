import { useEffect, useState } from 'react';
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, Database, ShieldCheck, Save, Upload,
  RefreshCw, Sparkles, Search, MessageSquare, Send, Map, Bug, Loader2
} from 'lucide-react';
import { jarvis } from '@/api/jarvisClient';
import { useLang } from '@/lib/i18n';
import { APP_VERSION } from '@/lib/appVersion';

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
  const [learningStats, setLearningStats] = useState({ entries:0, successful:0, lastVerified:null });
  const [adminStatus, setAdminStatus] = useState({ active:false, expiresAt:null });
  const [adminSnapshot, setAdminSnapshot] = useState(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [autonomousState, setAutonomousState] = useState(null);
  const [autonomousGoal, setAutonomousGoal] = useState(
    'Térképezd fel a Jarvist, keresd meg a bizonyítható hibákat és regressziókat, javítsd őket a legkisebb biztonságos módosítással, majd futtasd végig az összes ellenőrzést.'
  );
  const [autonomousBusy, setAutonomousBusy] = useState(false);
  const [crashes, setCrashes] = useState([]);
  const currentVersionCrashes = crashes.filter((item) => String(item?.appVersion || '') === APP_VERSION);
  const latestCurrentCrash = currentVersionCrashes[0] || null;

  useEffect(() => {
    window.jarvisDesktop?.elevatedDiagnostics?.status?.()
      .then((status) => setAdminStatus(status || { active:false, expiresAt:null }))
      .catch(() => {});
    window.jarvisDesktop?.getRecentCrashes?.(12)
      .then((items) => setCrashes(Array.isArray(items) ? items : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const state = await window.jarvisDesktop?.developerRepair?.autonomousStatus?.();
        if (!cancelled && state) setAutonomousState(state);
      } catch {}
    };
    refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const toggleCrashAutoRepair = async () => {
    try {
      const next = !autonomousState?.autoCrashRepair;
      const state = await window.jarvisDesktop?.developerRepair?.setCrashAutoRepair?.(next);
      if (state) setAutonomousState(state);
      setMessage(next
        ? tx('✓ Crash esetén az Autopilot automatikusan megpróbál biztonságos javítást készíteni.', '✓ Autopilot will automatically prepare a safe repair after crashes.')
        : tx('Automatikus crash-javítás kikapcsolva.', 'Automatic crash repair disabled.'));
    } catch (error) {
      setMessage(tx('Crash-javítás beállítási hiba: ', 'Crash repair setting error: ') + (error?.message || error));
    }
  };

  const analyzeLatestCrash = () => {
    const latest = latestCurrentCrash;
    if (!latest) {
      if (crashes.length) {
        const newestOldVersion = crashes[0]?.appVersion || tx('ismeretlen', 'unknown');
        setMessage(tx(
          `Nincs crash a jelenlegi ${APP_VERSION} verzióból. A legutóbbi napló egy korábbi (${newestOldVersion}) verzióból származik, ezért nem elemzem aktuális hibaként.`,
          `There is no crash from the current ${APP_VERSION} version. The latest record is from an older (${newestOldVersion}) version, so it will not be analyzed as a current failure.`
        ));
      } else {
        setMessage(tx('Nincs friss crash napló.', 'No recent crash record.'));
      }
      return;
    }
    const evidence = JSON.stringify(latest);
    sendSelfRepairMessage(tx(
      `Elemezd a jelenlegi ${APP_VERSION} verzió legutóbbi Crash Watchdog eseményét. Azonosítsd a valószínű okot és javasolj vagy készíts biztonságos javítást. Crash: ${evidence}`,
      `Analyze the latest Crash Watchdog event from the current ${APP_VERSION} version. Identify the likely cause and propose or prepare a safe repair. Crash: ${evidence}`
    ));
  };

  const startAutonomousRepair = async () => {
    if (!window.jarvisDesktop?.developerRepair?.runAutonomous) {
      setMessage(tx('Az automatikus Self-Repair nem érhető el.', 'Autonomous Self-Repair is unavailable.'));
      return;
    }

    const goal = autonomousGoal.trim();
    if (!goal) {
      setMessage(tx('Adj meg egy fejlesztési vagy javítási célt.', 'Enter a repair or development goal.'));
      return;
    }

    const confirmed = window.confirm(tx(
      'Az Autopilot ezután önállóan elemezhet és módosíthatja a Jarvis fejlesztési munkamásolatát. Minden módosítást sandboxban tesztel, hibánál visszaállít, és a kiadást NEM publikálja a jóváhagyásod nélkül. Elindítod?',
      'Autopilot may now analyze and modify the Jarvis development workspace automatically. Every change is sandbox-tested, failures are rolled back, and no release is published without your approval. Start it?'
    ));
    if (!confirmed) return;

    setAutonomousBusy(true);
    setMessage(tx('Autopilot munkamappa előkészítése...', 'Preparing Autopilot workspace...'));
    try {
      const prepared = await window.jarvisDesktop.developerRepair.prepareAutonomousWorkspace();
      setMessage(tx('Autopilot fut: elemzés → javítás → sandbox → teszt → újraellenőrzés...', 'Autopilot running: analyze → repair → sandbox → test → revalidate...'));
      const result = await window.jarvisDesktop.developerRepair.runAutonomous({
        workspace:prepared?.workspace,
        goal,
        maxIterations:4
      });
      setAutonomousState(result || null);
      if (result?.status === 'RELEASE_CANDIDATE_READY') {
        setMessage(tx(
          '✓ A javítási ciklus kész. Release candidate előkészítve; a kiadás továbbra is a te jóváhagyásodra vár.',
          '✓ Repair cycle complete. Release candidate prepared; publishing still waits for your approval.'
        ));
      } else {
        setMessage(tx(
          'Az Autopilot befejezte a jelenlegi ciklust. Ellenőrizd az állapotot a panelen.',
          'Autopilot finished the current cycle. Check the status panel.'
        ));
      }
    } catch (error) {
      setMessage(tx('Autopilot hiba: ', 'Autopilot error: ') + (error?.message || error));
    } finally {
      setAutonomousBusy(false);
    }
  };

  const stopAutonomousRepair = async () => {
    try {
      const state = await window.jarvisDesktop?.developerRepair?.stopAutonomous?.();
      if (state) setAutonomousState(state);
      setMessage(tx('Az Autopilot leállítását kértem.', 'Autopilot stop requested.'));
    } catch (error) {
      setMessage(tx('Leállítási hiba: ', 'Stop error: ') + (error?.message || error));
    }
  };

  const approveReleaseCandidate = async () => {
    const candidateId = autonomousState?.releaseCandidate?.id;
    if (!candidateId) return;
    const confirmed = window.confirm(tx(
      'Ez feloldja a kiadási kaput ehhez a release candidate-hez. A kód addig nem tekinthető kiadásra engedélyezettnek. Jóváhagyod?',
      'This unlocks the release gate for this release candidate. Approve it for release?'
    ));
    if (!confirmed) return;

    try {
      const state = await window.jarvisDesktop?.developerRepair?.approveReleaseCandidate?.(candidateId);
      if (state) setAutonomousState(state);
      setMessage(tx(
        '✓ Release jóváhagyva. Ez a lépés még nem publikált semmit; csak a tulajdonosi kiadási kaput oldotta fel.',
        '✓ Release approved. Nothing was published by this step; it only unlocked the owner release gate.'
      ));
    } catch (error) {
      setMessage(tx('Release jóváhagyási hiba: ', 'Release approval error: ') + (error?.message || error));
    }
  };

  const revokeReleaseApproval = async () => {
    try {
      const state = await window.jarvisDesktop?.developerRepair?.revokeReleaseApproval?.();
      if (state) setAutonomousState(state);
      setMessage(tx('Release engedély visszavonva.', 'Release approval revoked.'));
    } catch (error) {
      setMessage(tx('Visszavonási hiba: ', 'Revoke error: ') + (error?.message || error));
    }
  };

  const startElevatedDiagnostics = async () => {
    if (!window.jarvisDesktop?.elevatedDiagnostics?.start) {
      setMessage(tx('A rendszergazdai diagnosztika nem érhető el.', 'Elevated diagnostics is unavailable.'));
      return;
    }
    setAdminBusy(true);
    setMessage(tx('Windows rendszergazdai engedélyre vár...', 'Waiting for Windows administrator approval...'));
    try {
      const status = await window.jarvisDesktop.elevatedDiagnostics.start();
      setAdminStatus(status || { active:false, expiresAt:null });
      const snapshot = await window.jarvisDesktop.elevatedDiagnostics.snapshot();
      setAdminSnapshot(snapshot || null);
      setMessage(tx(
        '✓ Rendszergazdai diagnosztikai munkamenet aktív. A Self-Repair most a Windows rendszerállapotát is látja.',
        '✓ Elevated diagnostics session is active. Self-Repair can now use Windows system state.'
      ));
    } catch (error) {
      setAdminStatus({ active:false, expiresAt:null });
      setAdminSnapshot(null);
      setMessage(tx('Rendszergazdai hozzáférés hiba: ', 'Administrator access error: ') + (error?.message || error));
    } finally {
      setAdminBusy(false);
    }
  };

  const stopElevatedDiagnostics = async () => {
    setAdminBusy(true);
    try {
      await window.jarvisDesktop?.elevatedDiagnostics?.stop?.();
      setAdminStatus({ active:false, expiresAt:null });
      setAdminSnapshot(null);
      setMessage(tx('Rendszergazdai diagnosztikai munkamenet leállítva.', 'Elevated diagnostics session stopped.'));
    } finally {
      setAdminBusy(false);
    }
  };

  const runCheck = async () => {
    setBusy(true);
    setMessage('');
    setRepairPlan(null);
    if (!window.jarvisDesktop?.runSystemCheck || !window.jarvisDesktop?.repair?.plan) {
      setBusy(false);
      setMessage(tx('A natív diagnosztikai híd nem érhető el.', 'Native diagnostics bridge is unavailable.'));
      return;
    }
    try {
      const next = await window.jarvisDesktop.runSystemCheck();
      if (!next?.id || !Array.isArray(next?.checks)) throw new Error(tx('Érvénytelen diagnosztikai válasz.','Invalid diagnostics response.'));
      const plan = await window.jarvisDesktop.repair.plan(next);
      if (!plan?.reportId || plan.reportId !== next.id) throw new Error(tx('A javítási terv nem ehhez a diagnózishoz tartozik.','Repair plan does not match this diagnostic report.'));
      setReport(next);
      setRepairPlan(plan);
    } catch (error) {
      setRepairPlan(null);
      setMessage(tx('Rendszerellenőrzés hiba: ', 'System check error: ') + (error?.message || error));
    } finally { setBusy(false); }
  };

  const mapProject = async () => {
    setMapBusy(true); setMessage('');
    try {
      const result = await jarvis.functions.invoke('selfRepairMap', { query:chatInput || '' });
      const map = result?.data?.map;
      if (!map?.summary) throw new Error(tx('A feltérképezés nem adott vissza használható programtérképet.','Mapping returned no usable project map.'));
      setProjectMap(map);
      if (result?.data?.learning) setLearningStats(result.data.learning);
      if (result?.data?.admin) setAdminStatus(result.data.admin);
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
      const result = await window.jarvisDesktop?.repair?.apply?.(repair.id, repairPlan?.reportId);
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
      else throw new Error(result?.error || tx('A mentés nem sikerült.','Backup failed.'));
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
      else throw new Error(result?.error || tx('A visszaállítás nem sikerült.','Restore failed.'));
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
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><ShieldCheck size={19} className="text-primary"/></div>
              <div>
                <h2 className="font-semibold">{tx('Rendszergazdai rendszerdiagnosztika','Elevated system diagnostics')}</h2>
                <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
                  {tx(
                    'A Windows UAC engedélyablakával ideiglenes, 30 perces rendszergazdai diagnosztikai munkamenetet indít. A Self-Repair így látja az operációs rendszer, lemezek, folyamatok, szolgáltatások, hálózat, illesztőprogramok, telepített programok és friss rendszerhibák állapotát. Javítást továbbra is csak külön jóváhagyással hajt végre.',
                    'Starts a temporary 30-minute administrator diagnostics session through Windows UAC. Self-Repair can inspect OS, disks, processes, services, network, drivers, installed apps and recent system errors. Repairs still require separate approval.'
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={adminStatus.active ? stopElevatedDiagnostics : startElevatedDiagnostics}
              disabled={adminBusy}
              className={adminStatus.active
                ? 'px-4 py-3 rounded-xl border border-green-500/30 bg-green-500/10 text-green-400 font-semibold text-sm disabled:opacity-50'
                : 'px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50'}
            >
              {adminBusy
                ? tx('Engedélyezés...','Authorizing...')
                : adminStatus.active
                  ? tx('Rendszergazdai mód leállítása','Stop elevated mode')
                  : tx('Rendszergazdai hozzáférés engedélyezése','Allow administrator diagnostics')}
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            <div className="jarvis-metric"><span>{tx('Admin állapot','Admin status')}</span><strong>{adminStatus.active ? tx('AKTÍV','ACTIVE') : tx('KIKAPCSOLVA','OFF')}</strong></div>
            <div className="jarvis-metric"><span>{tx('Tanult javítások','Learned repairs')}</span><strong>{learningStats.entries || 0}</strong></div>
            <div className="jarvis-metric"><span>{tx('Folyamatok','Processes')}</span><strong>{Array.isArray(adminSnapshot?.Processes) ? adminSnapshot.Processes.length : '-'}</strong></div>
            <div className="jarvis-metric"><span>{tx('Rendszeresemények','System events')}</span><strong>{Array.isArray(adminSnapshot?.RecentEvents) ? adminSnapshot.RecentEvents.length : '-'}</strong></div>
          </div>
        </section>

        <section className="app-surface rounded-3xl p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0"><AlertTriangle size={19} className="text-red-400"/></div>
              <div>
                <h2 className="font-semibold">{tx('Crash Watchdog + automatikus helyreállítás','Crash Watchdog + automatic recovery')}</h2>
                <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
                  {tx(
                    'Renderer- vagy folyamatösszeomlásnál naplót készít, korlátozottan újraindítja a felületet, crash-loop esetén leáll, és aktív Autopilot mellett a crash bizonyítékot automatikusan átadja a Self-Repairnek.',
                    'On renderer or process failure it records evidence, performs bounded UI recovery, stops on crash loops, and with Autopilot active feeds crash evidence into Self-Repair automatically.'
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={toggleCrashAutoRepair} className={autonomousState?.autoCrashRepair
                ? 'rounded-xl border border-green-500/30 bg-green-500/10 text-green-400 px-4 py-2.5 text-xs font-semibold'
                : 'rounded-xl border border-border bg-secondary px-4 py-2.5 text-xs font-semibold'}>
                {autonomousState?.autoCrashRepair ? tx('Auto crash-javítás: BE','Auto crash repair: ON') : tx('Auto crash-javítás: KI','Auto crash repair: OFF')}
              </button>
              <button onClick={analyzeLatestCrash} disabled={!latestCurrentCrash || chatBusy} className="rounded-xl border border-border bg-secondary px-4 py-2.5 text-xs font-semibold disabled:opacity-50">
                {tx('Legutóbbi crash elemzése','Analyze latest crash')}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            <div className="jarvis-metric"><span>{tx('Aktuális verzió crash','Current-version crashes')}</span><strong>{currentVersionCrashes.length}</strong></div>
            <div className="jarvis-metric"><span>{tx('Auto crash-javítás','Auto crash repair')}</span><strong>{autonomousState?.autoCrashRepair ? tx('AKTÍV','ACTIVE') : tx('KIKAPCSOLVA','OFF')}</strong></div>
            <div className="jarvis-metric"><span>{tx('Utolsó típus','Latest type')}</span><strong className="text-[10px]">{latestCurrentCrash?.kind || '-'}</strong></div>
            <div className="jarvis-metric"><span>{tx('Utolsó időpont','Latest time')}</span><strong className="text-[10px]">{latestCurrentCrash?.at ? new Date(latestCurrentCrash.at).toLocaleString() : '-'}</strong></div>
          </div>
        </section>

        <section className="app-surface rounded-3xl p-5 md:p-6 border border-primary/20">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Sparkles size={19} className="text-primary"/></div>
              <div className="min-w-0">
                <h2 className="font-semibold">{tx('Autopilot önfejlesztés','Autopilot self-development')}</h2>
                <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
                  {tx(
                    'Egy indítás után önállóan végigviszi az elemzés → javítási terv → sandbox → tesztek → alkalmazás → újratesztelés ciklust. Hibás javításnál visszaáll. A release publikálása külön tulajdonosi kapu mögött marad.',
                    'After one start, it automatically runs analyze → repair plan → sandbox → tests → apply → revalidate. Failed changes roll back. Release publication remains behind a separate owner gate.'
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {autonomousBusy || ['RUNNING','ANALYZING','SANDBOX_TESTING','APPLYING_VERIFIED_PATCH','PATCH_VERIFIED','PLANNER_RETRY','PLAN_RETRY','SANDBOX_RETRY','VALIDATION_RETRY','ROLLED_BACK_RETRY','BUILDING_RELEASE_CANDIDATE','STOP_REQUESTED'].includes(autonomousState?.status) ? (
                <button onClick={stopAutonomousRepair} className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 px-4 py-2.5 text-xs font-semibold">
                  {tx('Autopilot leállítása','Stop Autopilot')}
                </button>
              ) : (
                <button onClick={startAutonomousRepair} disabled={autonomousBusy} className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-semibold disabled:opacity-50">
                  {tx('Autopilot indítása','Start Autopilot')}
                </button>
              )}
            </div>
          </div>

          <textarea
            value={autonomousGoal}
            onChange={(e)=>setAutonomousGoal(e.target.value)}
            rows={3}
            disabled={autonomousBusy}
            className="mt-4 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none resize-y disabled:opacity-60"
            placeholder={tx('Mit javítson vagy fejlesszen automatikusan?','What should it repair or improve automatically?')}
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-4">
            <div className="jarvis-metric"><span>{tx('Autopilot állapot','Autopilot status')}</span><strong className="text-[11px]">{autonomousState?.status || 'IDLE'}</strong></div>
            <div className="jarvis-metric"><span>{tx('Iteráció','Iteration')}</span><strong>{autonomousState?.iteration ?? 0}</strong></div>
            <div className="jarvis-metric"><span>{tx('Igazolt javítás','Verified repairs')}</span><strong>{autonomousState?.applied?.length ?? 0}</strong></div>
            <div className="jarvis-metric"><span>{tx('Release kapu','Release gate')}</span><strong>{autonomousState?.releaseApproved ? tx('JÓVÁHAGYVA','APPROVED') : tx('ZÁRVA','LOCKED')}</strong></div>
          </div>

          {autonomousState?.workspace && (
            <p className="mt-3 text-[10px] text-muted-foreground break-all">
              {tx('Fejlesztési munkamappa: ','Development workspace: ')}{autonomousState.workspace}
            </p>
          )}

          {autonomousState?.lastError && (
            <div className="mt-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
              {autonomousState.lastError}
            </div>
          )}

          {autonomousState?.releaseCandidate && (
            <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/5 p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{tx('Release candidate elkészült','Release candidate ready')}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {tx(
                      'Jarvis idáig automatikus. A tényleges kiadás/publikálás csak a te külön jóváhagyásod után folytatható.',
                      'Jarvis is automatic up to this point. Actual release/publishing may continue only after your explicit approval.'
                    )}
                  </div>
                  {autonomousState.releaseCandidate?.installer && (
                    <div className="text-[10px] text-muted-foreground mt-2 break-all">
                      {tx('Tesztelt telepítő: ','Tested installer: ')}{autonomousState.releaseCandidate.installer}
                    </div>
                  )}
                  {autonomousState.releaseCandidate?.sha256 && (
                    <div className="text-[10px] text-muted-foreground mt-1 break-all">
                      SHA-256: {autonomousState.releaseCandidate.sha256}
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="jarvis-metric"><span>{tx('Kockázat','Risk')}</span><strong>{riskLabel(autonomousState.releaseCandidate?.riskSummary || 'low', hu)}</strong></div>
                    <div className="jarvis-metric"><span>{tx('Módosított fájl','Changed files')}</span><strong>{autonomousState.releaseCandidate?.changedFiles?.length || 0}</strong></div>
                    <div className="jarvis-metric"><span>{tx('Digitális aláírás','Code signing')}</span><strong>{autonomousState.releaseCandidate?.signed ? tx('ÉRVÉNYES','VALID') : tx('NINCS / NEM ÉRVÉNYES','UNSIGNED')}</strong></div>
                    <div className="jarvis-metric"><span>{tx('Release manifest','Release manifest')}</span><strong>{autonomousState.releaseCandidate?.manifestPath ? 'OK' : '-'}</strong></div>
                  </div>
                  {autonomousState.releaseCandidate?.signature?.subject && (
                    <div className="text-[10px] text-muted-foreground mt-2 break-all">
                      {tx('Aláíró: ','Signer: ')}{autonomousState.releaseCandidate.signature.subject}
                    </div>
                  )}
                  {autonomousState.releaseCandidate?.changedFiles?.length > 0 && (
                    <div className="text-[10px] text-muted-foreground mt-2 break-all">
                      {tx('Fájlok: ','Files: ')}{autonomousState.releaseCandidate.changedFiles.join(', ')}
                    </div>
                  )}
                </div>
                {autonomousState.releaseApproved ? (
                  <button onClick={revokeReleaseApproval} className="rounded-xl border border-border bg-secondary px-4 py-2 text-xs font-semibold">
                    {tx('Engedély visszavonása','Revoke approval')}
                  </button>
                ) : (
                  <button onClick={approveReleaseCandidate} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold">
                    {tx('Release engedélyezése','Approve release')}
                  </button>
                )}
              </div>
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
              'Kézi módban továbbra is kérhetsz elemzést és javaslatot. Autopilot módban a javítások sandbox + teljes teszt + automatikus rollback mellett önállóan alkalmazhatók; a release kapu viszont kizárólag tulajdonosi jóváhagyással nyitható ki.',
              'Manual mode still supports analysis and proposals. In Autopilot mode, repairs may be applied automatically after sandboxing and full validation with rollback; the release gate can only be unlocked by the owner.'
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
