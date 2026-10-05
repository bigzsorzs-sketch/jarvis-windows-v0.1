import { useEffect, useRef, useState } from 'react';
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, Database, ShieldCheck, Save, Upload,
  RefreshCw, Sparkles, Search, MessageSquare, Send, Map, Bug, Loader2,
  Github, GitPullRequest, GitMerge, Rocket, Download, Unplug
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

function canonicalAppVersion(value = '') {
  return String(value || '').trim().replace(/^v/i,'').split('+')[0];
}

function safeJsonForPrompt(value, maxLength = 12000) {
  const seen = new WeakSet();
  try {
    const json = JSON.stringify(value, (_key, current) => {
      if (typeof current === 'bigint') return `${current.toString()}n`;
      if (current && typeof current === 'object') {
        if (seen.has(current)) return '[Circular]';
        seen.add(current);
      }
      return current;
    }) ?? '';
    return json.length > maxLength
      ? `${json.slice(0, maxLength)}…[truncated ${json.length - maxLength} chars]`
      : json;
  } catch (error) {
    return `[Crash evidence serialization failed: ${String(error?.message || error).slice(0, 500)}]`;
  }
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
  const [pendingRepair, setPendingRepair] = useState(null);
  const pendingRequestEpoch = useRef(0);
  const [manualApplyBusy, setManualApplyBusy] = useState(false);
  const [crashes, setCrashes] = useState([]);
  const [githubStatus, setGithubStatus] = useState({ connected:false, repo:'bigzsorzs-sketch/jarvis-windows-v0.1', repair:null });
  const [githubToken, setGithubToken] = useState('');
  const [githubBusy, setGithubBusy] = useState('');
  const [allowUnsignedRelease, setAllowUnsignedRelease] = useState(false);
  const currentVersionCrashes = crashes.filter((item) => canonicalAppVersion(item?.appVersion) === canonicalAppVersion(APP_VERSION));
  const latestCurrentCrash = currentVersionCrashes[0] || null;

  useEffect(() => {
    window.jarvisDesktop?.elevatedDiagnostics?.status?.()
      .then((status) => setAdminStatus(status || { active:false, expiresAt:null }))
      .catch(() => {});
    window.jarvisDesktop?.getRecentCrashes?.(12)
      .then((items) => setCrashes(Array.isArray(items) ? items : []))
      .catch(() => {});
    const epoch = pendingRequestEpoch.current;
    window.jarvisDesktop?.developerRepair?.getPending?.()
      .then((plan) => {
        if (epoch === pendingRequestEpoch.current) {
          setPendingRepair(plan?.hash ? plan : null);
        }
      })
      .catch(() => {});
    window.jarvisDesktop?.developerRepair?.github?.status?.()
      .then((status) => setGithubStatus(status || { connected:false, repo:'bigzsorzs-sketch/jarvis-windows-v0.1', repair:null }))
      .catch(() => {});
  }, []);

  const refreshGitHubStatus = async () => {
    if (!window.jarvisDesktop?.developerRepair?.github?.refresh) return null;
    setGithubBusy('refresh');
    try {
      const status = await window.jarvisDesktop.developerRepair.github.refresh();
      setGithubStatus(status || { connected:false, repo:'bigzsorzs-sketch/jarvis-windows-v0.1', repair:null });
      return status;
    } catch (error) {
      setMessage(tx('GitHub állapot hiba: ','GitHub status error: ') + (error?.message || error));
      return null;
    } finally {
      setGithubBusy('');
    }
  };

  const connectGitHub = async () => {
    const token = githubToken.trim();
    if (!token || !window.jarvisDesktop?.developerRepair?.github?.connect) return;
    setGithubBusy('connect');
    try {
      await window.jarvisDesktop.developerRepair.github.connect(token);
      setGithubToken('');
      const status = await window.jarvisDesktop.developerRepair.github.status();
      setGithubStatus(status);
      setMessage(tx(
        '✓ GitHub kapcsolat ellenőrizve. A token a Windows titkosított tárolójában van, és nem kerül az AI promptokba.',
        '✓ GitHub connection verified. The token is stored in Windows secure storage and is never sent to AI prompts.'
      ));
    } catch (error) {
      setMessage(tx('GitHub csatlakozási hiba: ','GitHub connection error: ') + (error?.message || error));
    } finally {
      setGithubBusy('');
    }
  };

  const disconnectGitHub = async () => {
    if (!window.jarvisDesktop?.developerRepair?.github?.disconnect) return;
    setGithubBusy('disconnect');
    try {
      const status = await window.jarvisDesktop.developerRepair.github.disconnect();
      setGithubStatus({ ...(status || {}), repair:githubStatus?.repair || null });
      setGithubToken('');
      setMessage(tx('GitHub kapcsolat bontva.','GitHub connection disconnected.'));
    } catch (error) {
      setMessage(tx('GitHub kapcsolat bontási hiba: ','GitHub disconnect error: ') + (error?.message || error));
    } finally {
      setGithubBusy('');
    }
  };

  const abandonGitHubRepair = async () => {
    if (!window.jarvisDesktop?.developerRepair?.github?.abandon) return;
    const approved = window.confirm(tx(
      'Elveted ezt a Self-Repair PR-t? A PR bezárul, a javítási ág törlődik, és új javítás készíthető.',
      'Abandon this Self-Repair PR? The PR will be closed, its repair branch deleted, and a new repair may be created.'
    ));
    if (!approved) return;
    setGithubBusy('abandon');
    try {
      await window.jarvisDesktop.developerRepair.github.abandon();
      setGithubStatus(prev=>({ ...prev, repair:null }));
      setMessage(tx('Self-Repair PR elvetve. Új javítás készíthető.','Self-Repair PR abandoned. A new repair can be created.'));
    } catch (error) {
      setMessage(tx('GitHub elvetési hiba: ','GitHub abandon error: ') + (error?.message || error));
    } finally {
      setGithubBusy('');
    }
  };

  const mergeGitHubRepair = async () => {
    if (!window.jarvisDesktop?.developerRepair?.github?.merge) return;
    setGithubBusy('merge');
    try {
      const repair = await window.jarvisDesktop.developerRepair.github.merge();
      setGithubStatus(prev=>({ ...prev, repair }));
      setMessage(tx(
        '✓ A CI által ellenőrzött Self-Repair PR bekerült a main ágba. Most a main teljes buildjét kell megvárni.',
        '✓ The CI-verified Self-Repair PR was merged into main. The full main build must pass next.'
      ));
    } catch (error) {
      setMessage(tx('GitHub merge hiba: ','GitHub merge error: ') + (error?.message || error));
    } finally {
      setGithubBusy('');
    }
  };

  const publishGitHubRepair = async () => {
    if (!window.jarvisDesktop?.developerRepair?.github?.publish) return;
    setGithubBusy('publish');
    try {
      const repair = await window.jarvisDesktop.developerRepair.github.publish(allowUnsignedRelease);
      setGithubStatus(prev=>({ ...prev, repair }));
      setMessage(tx(
        '✓ A kiadási workflow elindult. A Release csak akkor készül el, ha a teljes publikálási build is átmegy.',
        '✓ The release workflow has started. A Release is created only if the complete publication build also passes.'
      ));
    } catch (error) {
      setMessage(tx('GitHub publikálási hiba: ','GitHub publication error: ') + (error?.message || error));
    } finally {
      setGithubBusy('');
    }
  };

  const installReleasedUpdate = async () => {
    if (!window.jarvisDesktop?.oneClickUpdate) return;
    setGithubBusy('install');
    try {
      const result = await window.jarvisDesktop.oneClickUpdate();
      if (result?.status === 'up-to-date') {
        setMessage(tx('A telepített Jarvis már a legújabb stabil verzió.','Installed Jarvis is already the latest stable version.'));
      } else {
        setMessage(tx('Frissítés ellenőrizve és telepítésre átadva. Jarvis újra fog indulni.','Update verified and handed to the installer. Jarvis will restart.'));
      }
    } catch (error) {
      setMessage(tx('Frissítési hiba: ','Update error: ') + (error?.message || error));
    } finally {
      setGithubBusy('');
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
    const evidence = safeJsonForPrompt(latest);
    sendSelfRepairMessage(tx(
      `Elemezd a jelenlegi ${APP_VERSION} verzió legutóbbi Crash Watchdog eseményét. Azonosítsd a valószínű okot és javasolj vagy készíts biztonságos javítást. Crash: ${evidence}`,
      `Analyze the latest Crash Watchdog event from the current ${APP_VERSION} version. Identify the likely cause and propose or prepare a safe repair. Crash: ${evidence}`
    ));
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
    if (!content || chatBusy || manualApplyBusy) return;
    const userTurn = { role:'user', content };
    const nextHistory = [...conversation, userTurn];
    pendingRequestEpoch.current += 1;
    setPendingRepair(null);
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
      if (data.pendingRepair?.hash) {
        setPendingRepair(data.pendingRepair);
        setMessage(tx('Javítási terv elkészült. Ellenőrizd a választ, majd nyomd meg az „Elfogadom” gombot.','Repair plan is ready. Review the answer, then press “Accept”.'));
      } else if (data.pendingRepair?.error) {
        setPendingRepair(null);
        setMessage(tx('Javítási terv hiba: ','Repair plan error: ') + data.pendingRepair.error);
      }
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

  const applyPendingRepair = async () => {
    const hash = pendingRepair?.hash;
    if (!hash || manualApplyBusy || chatBusy) return;
    setManualApplyBusy(true);
    setMessage(tx('Javítás izolált ellenőrzése, teljes helyi build és GitHub PR előkészítése...','Validating repair in isolation, running the full local build and preparing a GitHub PR...'));
    try {
      const result = await window.jarvisDesktop?.developerRepair?.applyPending?.(hash);
      if (!result?.success) {
        if (result?.status === 'ROLLED_BACK') {
          throw new Error(tx('A közvetlen javítás ellenőrzése hibát talált, ezért Jarvis visszaállította a mentést.','Direct repair validation failed, so Jarvis restored the backup.'));
        }
        throw new Error(tx('A javítás nem fejeződött be.','Repair did not complete.'));
      }
      setPendingRepair(null);
      if (result?.status !== 'GITHUB_PR_OPENED' || !result?.github?.prNumber) {
        throw new Error(tx('A GitHub javítási PR nem jött létre.','GitHub repair PR was not created.'));
      }
      setGithubStatus(prev=>({ ...prev, connected:true, repair:result.github }));
      setMessage(
        tx('✓ A javítás helyben teljesen ellenőrizve, a staging forrás visszaállítva, majd a pontos javított bájtok GitHub PR-ba kerültek. PR #','✓ Repair passed the full local validation, staging source was restored, and the exact validated bytes were sent to GitHub PR #') +
        result.github.prNumber +
        tx('. Most a független GitHub CI következik; a telepített Jarvis még nem változott.','. Independent GitHub CI is next; the installed Jarvis has not changed.')
      );
    } catch (error) {
      const errorMessage = String(error?.message || error || '');
      if (/JARVIS_OWNER_ACTION_CANCELLED/.test(errorMessage)) {
        setMessage(tx('A javítást nem alkalmaztam. A terv az érvényességi időn belül újra jóváhagyható.','Repair was not applied. You may approve the same proposal while it remains valid.'));
      } else if (/MANUAL_REPAIR_PLAN_(?:NOT_FOUND|EXPIRED|MUTATED)/.test(errorMessage)) {
        setPendingRepair(null);
        setMessage(tx(
          'A korábbi javítási terv már nem érvényes. Kérd újra a javítást; Jarvis friss tervet készít a jelenlegi forrásból.',
          'The previous repair plan is no longer valid. Ask for the repair again and Jarvis will prepare a fresh plan from the current source.'
        ));
      } else if (/GITHUB_REPAIR_ALREADY_ACTIVE/.test(errorMessage)) {
        setMessage(tx(
          'Már van aktív GitHub Self-Repair folyamat. Előbb ellenőrizd, merge-eld, add ki vagy vesd el azt a PR-t.',
          'A GitHub Self-Repair flow is already active. Verify, merge, publish or abandon that PR before starting another repair.'
        ));
      } else {
        setMessage(tx('Kézi Self-Repair hiba: ','Manual Self-Repair error: ') + errorMessage);
      }
    } finally {
      setManualApplyBusy(false);
    }
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
  const githubRepair = githubStatus?.repair || null;
  const repairCiState = githubRepair?.prStatus?.ci?.state || null;
  const mainCiState = githubRepair?.mainStatus?.ci?.state || null;
  const releaseState = githubRepair?.releaseStatus?.state || (githubRepair?.phase === 'released' ? 'released' : null);
  const canMergeGitHubRepair = Boolean(
    githubStatus?.connected
    && githubRepair?.prNumber
    && !githubRepair?.mergeSha
    && repairCiState === 'passed'
  );
  const canPublishGitHubRepair = Boolean(
    githubStatus?.connected
    && githubRepair?.mergeSha
    && githubRepair?.mainStatus?.state === 'current'
    && mainCiState === 'passed'
    && githubRepair?.phase !== 'released'
    && (githubRepair?.phase !== 'release-dispatched' || releaseState === 'failed')
  );

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
                <h2 className="font-semibold">{tx('Crash Watchdog + helyreállítás','Crash Watchdog + recovery')}</h2>
                <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
                  {tx(
                    'Renderer- vagy folyamatösszeomlásnál naplót készít, korlátozottan újraindítja a felületet, crash-loop esetén leáll. A legutóbbi crash kézzel átadható a Self-Repair párbeszédnek elemzésre.',
                    'On renderer or process failure it records evidence, performs bounded UI recovery and stops on crash loops. The latest crash can be sent manually to the Self-Repair conversation for analysis.'
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={analyzeLatestCrash} disabled={!latestCurrentCrash || chatBusy || manualApplyBusy} className="rounded-xl border border-border bg-secondary px-4 py-2.5 text-xs font-semibold disabled:opacity-50">
                {tx('Legutóbbi crash elemzése','Analyze latest crash')}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-4">
            <div className="jarvis-metric"><span>{tx('Aktuális verzió crash','Current-version crashes')}</span><strong>{currentVersionCrashes.length}</strong></div>
            <div className="jarvis-metric"><span>{tx('Utolsó típus','Latest type')}</span><strong className="text-[10px]">{latestCurrentCrash?.kind || '-'}</strong></div>
            <div className="jarvis-metric"><span>{tx('Utolsó időpont','Latest time')}</span><strong className="text-[10px]">{latestCurrentCrash?.at ? new Date(latestCurrentCrash.at).toLocaleString() : '-'}</strong></div>
          </div>
        </section>

        <section className="app-surface rounded-3xl p-5 md:p-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Github size={19} className="text-primary"/></div>
              <div className="min-w-0">
                <h2 className="font-semibold">{tx('GitHub Self-Repair kapcsolat','GitHub Self-Repair connection')}</h2>
                <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
                  {tx(
                    'A javítás először izolált helyi munkatérben fut végig a teljes ellenőrzésen. Csak a pontosan ellenőrzött fájlbájtok kerülhetnek külön fix/jarvis-self-repair ágra. A main merge és a Release külön tulajdonosi művelet.',
                    'The repair first passes the complete validation in an isolated local workspace. Only the exact validated file bytes may be sent to a dedicated fix/jarvis-self-repair branch. Main merge and Release remain separate owner actions.'
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={githubStatus?.connected ? 'text-xs font-semibold text-green-400' : 'text-xs font-semibold text-muted-foreground'}>
                {githubStatus?.connected ? tx('● CSATLAKOZVA','● CONNECTED') : tx('○ NINCS KAPCSOLAT','○ DISCONNECTED')}
              </span>
              <button
                onClick={refreshGitHubStatus}
                disabled={Boolean(githubBusy)}
                className="rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw size={14} className={githubBusy === 'refresh' ? 'animate-spin' : ''}/>{tx('Frissítés','Refresh')}
              </button>
            </div>
          </div>

          {!githubStatus?.connected ? (
            <div className="mt-4 rounded-2xl border border-border bg-background/50 p-4">
              <label className="text-xs font-semibold">{tx('Fine-grained GitHub token','Fine-grained GitHub token')}</label>
              <div className="flex flex-col md:flex-row gap-2 mt-2">
                <input
                  type="password"
                  autoComplete="off"
                  value={githubToken}
                  onChange={(event)=>setGithubToken(event.target.value)}
                  placeholder="github_pat_..."
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none"
                />
                <button
                  onClick={connectGitHub}
                  disabled={githubBusy === 'connect' || !githubToken.trim()}
                  className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {githubBusy === 'connect' ? tx('Ellenőrzés...','Verifying...') : tx('GitHub csatlakoztatása','Connect GitHub')}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                {tx(
                  'Csak ehhez a repositoryhoz adj jogosultságot: Contents Read/Write, Pull requests Read/Write, Actions Read/Write. A token Windows safeStorage/DPAPI alatt marad, az AI nem kapja meg.',
                  'Grant access only to this repository: Contents Read/Write, Pull requests Read/Write, Actions Read/Write. The token stays under Windows safeStorage/DPAPI and is never exposed to AI.'
                )}
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-2xl border border-border bg-background/50 p-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold break-all">{githubStatus.repo || 'bigzsorzs-sketch/jarvis-windows-v0.1'}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {tx('Alap ág: ','Base branch: ')}{githubStatus.defaultBranch || 'main'}
                  </div>
                </div>
                <button
                  onClick={disconnectGitHub}
                  disabled={Boolean(githubBusy)}
                  className="rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  <Unplug size={14}/>{tx('Kapcsolat bontása','Disconnect')}
                </button>
              </div>

              {githubRepair && (
                <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="jarvis-metric"><span>{tx('Jelölt verzió','Candidate')}</span><strong>{githubRepair.version ? 'v'+githubRepair.version : '-'}</strong></div>
                    <div className="jarvis-metric"><span>{tx('Pull Request','Pull Request')}</span><strong>{githubRepair.prNumber ? '#'+githubRepair.prNumber : '-'}</strong></div>
                    <div className="jarvis-metric"><span>{tx('PR CI','PR CI')}</span><strong>{repairCiState || '-'}</strong></div>
                    <div className="jarvis-metric"><span>{tx('Main CI','Main CI')}</span><strong>{mainCiState || '-'}</strong></div>
                  </div>

                  <div className="text-[11px] text-muted-foreground break-all">
                    {githubRepair.branch ? tx('Ág: ','Branch: ') + githubRepair.branch : ''}
                    {githubRepair.headSha ? ' · ' + githubRepair.headSha.slice(0,12) : ''}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={refreshGitHubStatus}
                      disabled={Boolean(githubBusy)}
                      className="rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
                    >
                      <GitPullRequest size={14}/>{tx('CI állapot ellenőrzése','Check CI status')}
                    </button>
                    <button
                      onClick={mergeGitHubRepair}
                      disabled={!canMergeGitHubRepair || Boolean(githubBusy)}
                      className="rounded-xl border border-green-500/30 bg-green-500/10 text-green-400 px-3 py-2 text-xs font-semibold flex items-center gap-2 disabled:opacity-40"
                    >
                      <GitMerge size={14}/>{githubBusy === 'merge' ? tx('Merge...','Merging...') : tx('Ellenőrzött PR merge','Merge verified PR')}
                    </button>
                    {!githubRepair?.mergeSha && (
                      <button
                        onClick={abandonGitHubRepair}
                        disabled={Boolean(githubBusy)}
                        className="rounded-xl border border-red-500/25 bg-red-500/10 text-red-400 px-3 py-2 text-xs font-semibold disabled:opacity-40"
                      >
                        {githubBusy === 'abandon' ? tx('Elvetés...','Abandoning...') : tx('PR elvetése','Abandon PR')}
                      </button>
                    )}
                  </div>

                  {githubRepair.mergeSha && (
                    <div className="rounded-xl border border-border bg-background/60 p-3">
                      <div className="text-xs font-semibold">{tx('Main ellenőrzés','Main verification')}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {tx('Merge commit: ','Merge commit: ')}{githubRepair.mergeSha.slice(0,12)} · {tx('állapot: ','state: ')}{mainCiState || githubRepair?.mainStatus?.state || '-'}
                      </div>
                    </div>
                  )}

                  {canPublishGitHubRepair && (
                    <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3">
                      <label className="flex items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={allowUnsignedRelease}
                          onChange={(event)=>setAllowUnsignedRelease(event.target.checked)}
                          className="mt-0.5"
                        />
                        <span>{tx(
                          'Engedélyezem az aláírás nélküli kiadást, ha nincs érvényes Authenticode aláírás. A SHA-256 és minden más kiadási ellenőrzés továbbra is kötelező.',
                          'Allow an unsigned release if no valid Authenticode signature is present. SHA-256 and every other release gate remain mandatory.'
                        )}</span>
                      </label>
                      <button
                        onClick={publishGitHubRepair}
                        disabled={Boolean(githubBusy)}
                        className="mt-3 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
                      >
                        <Rocket size={14}/>{githubBusy === 'publish' ? tx('Kiadás indítása...','Starting release...') : tx('Új verzió kiadása','Publish new version')}
                      </button>
                    </div>
                  )}

                  {githubRepair?.phase === 'release-dispatched' && releaseState !== 'released' && (
                    <div className="text-xs text-muted-foreground">
                      {tx('A kiadási build fut. Frissítsd az állapotot; Jarvis csak sikeres Release után engedi a telepítést.','Release build is running. Refresh status; Jarvis enables installation only after a successful Release.')}
                    </div>
                  )}

                  {releaseState === 'released' && (
                    <button
                      onClick={installReleasedUpdate}
                      disabled={Boolean(githubBusy)}
                      className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
                    >
                      <Download size={14}/>{githubBusy === 'install' ? tx('Frissítés...','Updating...') : tx('Ellenőrzött frissítés telepítése','Install verified update')}
                    </button>
                  )}
                </div>
              )}
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
              onClick={()=>sendSelfRepairMessage(tx('Térképezd fel a programot, keress lehetséges hibákat és mutasd meg őket fontossági sorrendben. Ne módosíts semmit; csak elemezd és magyarázd el a hibákat.','Map the program, find likely bugs and show them in priority order. Do not modify anything; only analyze and explain the issues.'))}
              disabled={chatBusy || manualApplyBusy}
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

          {pendingRepair?.hash && (
            <div className="mt-3 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
              <div className="font-semibold">{tx('Javítás készen áll jóváhagyásra','Repair ready for approval')}</div>
              <div className="text-muted-foreground mt-1">{pendingRepair.goal}</div>
              <div className="text-muted-foreground mt-1">
                {tx('Kockázat: ', 'Risk: ')}{riskLabel(pendingRepair.risk, hu)}
              </div>
              {pendingRepair.rationale && (
                <div className="text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                  {pendingRepair.rationale}
                </div>
              )}
              {pendingRepair.files?.length > 0 && (
                <div className="text-[10px] text-muted-foreground mt-1 break-all">
                  {tx('Módosítandó fájlok: ','Files to change: ')}{pendingRepair.files.join(', ')}
                </div>
              )}
            </div>
          )}

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
            <button onClick={()=>sendSelfRepairMessage()} disabled={chatBusy || manualApplyBusy || !chatInput.trim()} className="rounded-xl bg-primary text-primary-foreground px-4 flex items-center justify-center disabled:opacity-50" aria-label={tx('Küldés','Send')}>
              <Send size={18}/>
            </button>
            <button
              onClick={applyPendingRepair}
              disabled={manualApplyBusy || chatBusy || !pendingRepair?.hash}
              className="rounded-xl border border-green-500/30 bg-green-500/10 text-green-400 px-4 text-xs font-semibold disabled:opacity-40"
            >
              {manualApplyBusy ? tx('Ellenőrzés + GitHub PR...','Validate + GitHub PR...') : tx('Elfogadom','Accept')}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            {tx(
              'A „Hibák keresése” csak elemez. Az „Elfogadom” az adott hash-elt javítás jóváhagyása: Jarvis izolált munkatérben mentést készít, alkalmazza a patch-et, lefuttatja a teljes helyi ellenőrzést, majd visszaállítja a staging forrást. Csak ezután küldi a pontosan ellenőrzött fájlokat külön GitHub ágra és PR-ba. Main merge, kiadás és telepítés külön lépés.',
              '“Find bugs” only analyzes. “Accept” approves the exact hashed repair: Jarvis backs up an isolated workspace, applies the patch, runs the full local validation, then restores the staging source. Only then are the exact validated files sent to a dedicated GitHub branch and PR. Main merge, release and installation are separate steps.'
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
