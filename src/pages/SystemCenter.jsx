import { useState } from 'react';
import { Activity, CheckCircle2, XCircle, AlertTriangle, Database, ShieldCheck, Save, Upload, RefreshCw } from 'lucide-react';

function statusClasses(check) {
  if (check.ok) return 'border-green-500/30 bg-green-500/10 text-green-400';
  if (check.severity === 'critical') return 'border-red-500/30 bg-red-500/10 text-red-400';
  return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400';
}

export default function SystemCenter() {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [message, setMessage] = useState('');

  const runCheck = async () => {
    if (!window.jarvisDesktop?.runSystemCheck) return;
    setBusy(true);
    setMessage('');
    try {
      setReport(await window.jarvisDesktop.runSystemCheck());
    } catch (error) {
      setMessage('Rendszerellenőrzés hiba: ' + (error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const createBackup = async () => {
    if (passphrase.length < 8) {
      setMessage('A backup jelszó legalább 8 karakter legyen.');
      return;
    }
    setBackupBusy(true);
    setMessage('');
    try {
      const result = await window.jarvisDesktop?.backup?.create(passphrase);
      if (result?.success) setMessage('✓ Mentés elkészült: ' + result.path);
      else if (result?.canceled) setMessage('Mentés megszakítva.');
    } catch (error) {
      setMessage('Backup hiba: ' + (error?.message || error));
    } finally {
      setBackupBusy(false);
    }
  };

  const restoreBackup = async () => {
    if (passphrase.length < 8) {
      setMessage('A visszaállításhoz add meg a mentés jelszavát.');
      return;
    }
    if (!window.confirm('A visszaállítás lecseréli a jelenlegi Jarvis helyi adatbázist. Folytatod?')) return;

    setBackupBusy(true);
    setMessage('');
    try {
      const result = await window.jarvisDesktop?.backup?.restore(passphrase);
      if (result?.success) {
        setMessage('✓ Mentés visszaállítva. Indítsd újra a Jarvist az összes nézet frissítéséhez.');
      } else if (result?.canceled) {
        setMessage('Visszaállítás megszakítva.');
      }
    } catch (error) {
      const text = error?.message === 'BACKUP_PASSWORD_INVALID'
        ? 'Hibás backup jelszó vagy sérült mentés.'
        : (error?.message || error);
      setMessage('Visszaállítás hiba: ' + text);
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto jarvis-scroll">
      <div className="max-w-[1500px] mx-auto px-4 md:px-8 lg:px-10 py-5 md:py-8 space-y-5">
        <section className="app-surface rounded-3xl border border-primary/20 p-5 md:p-7">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="jarvis-core-orb h-12 w-12 rounded-2xl flex items-center justify-center shrink-0">
                <Activity className="text-primary" size={23} />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] text-primary">SYSTEM / HEALTH</p>
                <h1 className="text-2xl md:text-3xl font-bold mt-1">Jarvis System Center</h1>
                <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
                  SQLite, Windows biztonság, frissítési csatorna, OBD/COM, AI konfiguráció és digitális aláírás ellenőrzése.
                </p>
              </div>
            </div>
            <button
              onClick={runCheck}
              disabled={busy}
              className="px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
              {busy ? 'Ellenőrzés...' : 'Teljes rendszerellenőrzés'}
            </button>
          </div>
        </section>

        {report && (
          <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {report.checks.map((check) => {
              const Icon = check.ok ? CheckCircle2 : check.severity === 'critical' ? XCircle : AlertTriangle;
              return (
                <div key={check.id} className={'rounded-2xl border p-4 ' + statusClasses(check)}>
                  <div className="flex items-start gap-3">
                    <Icon size={18} className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{check.label}</p>
                      <p className="text-xs mt-1 opacity-80 break-words">{check.detail}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-3xl border border-border bg-card p-5 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Database size={19} className="text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Natív helyi adatbázis</h2>
                <p className="text-xs text-muted-foreground">SQLite + WAL · helyi, offline és migrálható</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A Windows Jarvis az alkalmazás rekordjait natív SQLite adatbázisban tárolja. A korábbi localStorage rekordok első induláskor automatikusan átmásolhatók az új adatbázisba.
            </p>
          </div>

          <div className="rounded-3xl border border-border bg-card p-5 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ShieldCheck size={19} className="text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Jelszavas Jarvis Backup</h2>
                <p className="text-xs text-muted-foreground">AES-256-GCM · PBKDF2-SHA256</p>
              </div>
            </div>

            <input
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="Backup jelszó (minimum 8 karakter)"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              <button
                onClick={createBackup}
                disabled={backupBusy}
                className="rounded-xl bg-secondary border border-border px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Save size={15} /> Mentés készítése
              </button>
              <button
                onClick={restoreBackup}
                disabled={backupBusy}
                className="rounded-xl bg-secondary border border-border px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Upload size={15} /> Mentés visszaállítása
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground mt-3">
              A jelszó nincs eltárolva. A mentés az adatbázist és a nem titkos beállításokat tartalmazza; az API-kulcsok nem kerülnek bele.
            </p>
          </div>
        </section>

        {message && (
          <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary break-words">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
