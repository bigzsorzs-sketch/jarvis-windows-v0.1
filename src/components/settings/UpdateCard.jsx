import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Download, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

function messageFor(result) {
  if (!result) return '';
  if (result.status === 'up-to-date') return `A Jarvis naprakész (v${result.currentVersion}).`;
  if (result.status === 'installing') {
    const verification = result.verification === 'sha256+manifest+authenticode'
      ? 'SHA-256 + release manifest + digitális aláírás'
      : result.verification === 'sha256+manifest'
        ? 'SHA-256 + release manifest'
        : 'SHA-256';
    return `Jarvis v${result.latestVersion} letöltve és ellenőrizve (${verification}). A telepítés indul…`;
  }
  return result.message || '';
}

export default function UpdateCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const desktopAvailable = Boolean(window.jarvisDesktop?.oneClickUpdate);

  const runUpdate = async () => {
    if (!desktopAvailable || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const updateResult = await window.jarvisDesktop.oneClickUpdate();
      setResult(updateResult);
    } catch (error) {
      setResult({ status: 'error', message: error?.message || 'A frissítés nem sikerült.' });
    } finally {
      setBusy(false);
    }
  };

  const ok = result?.status === 'up-to-date' || result?.status === 'installing';

  return (
    <Card className="bg-card border-border p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-foreground">Jarvis frissítés</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Egy kattintással ellenőrzi a stabil GitHub Release-t, a release manifestet és az SHA-256 összeget, majd telepíti a Windows-verziót.
          </p>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground">
            <ShieldCheck size={12} className="text-primary" />
            A helyi adatokról telepítés előtt biztonsági mentés készül, és csak ellenőrzött stabil GitHub Release telepíthető.
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={runUpdate}
        disabled={!desktopAvailable || busy}
        className="mt-4 w-full min-h-[44px] rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {busy ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
        {busy ? 'Frissítés ellenőrzése…' : 'Frissítés egy kattintással'}
      </button>

      {!desktopAvailable && (
        <div className="mt-3 flex items-start gap-2 text-xs text-yellow-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Ez a funkció a telepített Windows-verzióban érhető el.
        </div>
      )}

      {result && (
        <div className={`mt-3 rounded-xl px-3 py-2.5 text-xs flex items-start gap-2 ${ok ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
          {ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
          <span>{messageFor(result)}</span>
        </div>
      )}
    </Card>
  );
}
