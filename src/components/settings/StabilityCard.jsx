import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Activity, CheckCircle2, AlertTriangle, RefreshCw, FolderOpen } from 'lucide-react';

export default function StabilityCard() {
  const [status, setStatus] = useState(null);
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!window.jarvisDesktop?.getStabilityStatus) return;
    const data = await window.jarvisDesktop.getStabilityStatus();
    setStatus(data);
  };

  useEffect(() => { load().catch(() => {}); }, []);

  const runTest = async () => {
    if (!window.jarvisDesktop?.runStabilitySelfTest) return;
    setBusy(true);
    try {
      const result = await window.jarvisDesktop.runStabilitySelfTest();
      setTest(result);
      setStatus(result.status);
    } finally {
      setBusy(false);
    }
  };

  const openLogs = async () => {
    await window.jarvisDesktop?.openStabilityLogs?.();
  };

  const desktopAvailable = Boolean(window.jarvisDesktop?.getStabilityStatus);

  return (
    <Card className="bg-card border-border p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Activity className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-foreground">Stabilitás és önellenőrzés</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Ellenőrzi a Core Rules aláírását, a Windows titkosított tárhelyet, az adatkönyvtár írását és a crash-loop állapotot.
          </p>
        </div>
      </div>

      {status && (
        <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
          <div className="rounded-xl bg-secondary p-3">
            <div className="text-muted-foreground">Futási idő</div>
            <div className="font-semibold text-foreground mt-1">{Math.floor((status.uptimeSeconds || 0) / 60)} perc</div>
          </div>
          <div className="rounded-xl bg-secondary p-3">
            <div className="text-muted-foreground">Renderer restart / perc</div>
            <div className="font-semibold text-foreground mt-1">{status.rendererRestartsLastMinute || 0}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mt-4">
        <button
          type="button"
          onClick={runTest}
          disabled={!desktopAvailable || busy}
          className="min-h-[44px] rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
          {busy ? 'Ellenőrzés…' : 'Önellenőrzés'}
        </button>
        <button
          type="button"
          onClick={openLogs}
          disabled={!desktopAvailable}
          className="min-h-[44px] rounded-xl bg-secondary border border-border text-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <FolderOpen size={15} /> Napló
        </button>
      </div>

      {test && (
        <div className={`mt-3 rounded-xl p-3 border ${test.ok ? 'bg-primary/10 border-primary/20' : 'bg-destructive/10 border-destructive/20'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            {test.ok ? <CheckCircle2 size={15} className="text-primary" /> : <AlertTriangle size={15} className="text-destructive" />}
            <span className={test.ok ? 'text-primary' : 'text-destructive'}>
              {test.ok ? 'Minden alapellenőrzés rendben.' : 'Van olyan ellenőrzés, ami figyelmet igényel.'}
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {(test.checks || []).map(check => (
              <div key={check.id} className="text-xs text-muted-foreground">
                {check.ok ? '✅' : '⚠️'} {check.detail}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
