import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Wrench, ShieldCheck, Search, Check, X, RefreshCw } from 'lucide-react';

export default function SelfRepairCard() {
  const [enabled, setEnabled] = useState(true);
  const [proposals, setProposals] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!window.jarvisDesktop) return;
    const [settings, list] = await Promise.all([
      window.jarvisDesktop.getSettings?.(),
      window.jarvisDesktop.listSelfRepairs?.(),
    ]);
    if (settings) setEnabled(settings.supervisedSelfRepair !== false);
    setProposals(Array.isArray(list) ? list : []);
  };

  useEffect(() => { load().catch(() => {}); }, []);

  const toggle = async () => {
    if (!window.jarvisDesktop?.saveSettings) return;
    const next = !enabled;
    setEnabled(next);
    await window.jarvisDesktop.saveSettings({ supervisedSelfRepair: next });
  };

  const approve = async (id) => {
    setBusy(true);
    try {
      await window.jarvisDesktop?.approveSelfRepair?.(id);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const reject = async (id) => {
    setBusy(true);
    try {
      await window.jarvisDesktop?.rejectSelfRepair?.(id);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const pending = proposals.filter(p => p.status === 'pending').slice(0, 5);
  const recent = proposals.slice(0, 10);

  return (
    <Card className="bg-card border-border p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Wrench className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Felügyelt önjavítás</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Hiba esetén Jarvis nyilvános technikai forrásokban keres, AI-diagnózist készít, majd engedélyt kér a javításhoz.
              </p>
            </div>
            <button
              type="button"
              onClick={toggle}
              className={`relative w-12 h-6 rounded-full transition-all shrink-0 ${enabled ? 'bg-primary' : 'bg-secondary border border-border'}`}
              aria-label="Felügyelt önjavítás kapcsoló"
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${enabled ? 'left-6' : 'left-0.5'}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-secondary/70 border border-border p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-foreground">
          <Search size={13} className="text-primary" />
          GitHub Issues + Stack Overflow keresés
        </div>
        <div className="flex items-center gap-2 text-xs text-foreground">
          <ShieldCheck size={13} className="text-primary" />
          Javítás csak tulajdonosi jóváhagyás után
        </div>
        <div className="flex items-center gap-2 text-xs text-foreground">
          <ShieldCheck size={13} className="text-primary" />
          Core Rules / Policy Engine / updater-biztonság nem módosítható
        </div>
      </div>

      {pending.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Jóváhagyásra vár ({pending.length})
          </p>
          {pending.map(p => (
            <div key={p.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-start gap-2">
                <Wrench size={14} className="text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{p.summary}</p>
                  <p className="text-xs text-muted-foreground mt-1">{p.likelyCause}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Javaslat: {p.action} · bizonyosság: {p.confidence || 0}%
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => approve(p.id)}
                  className="min-h-[40px] rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {busy ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />} Engedélyezem
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => reject(p.id)}
                  className="min-h-[40px] rounded-xl bg-secondary border border-border text-foreground text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <X size={13} /> Elutasítom
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pending.length === 0 && recent.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Nincs jóváhagyásra váró javítás. Korábbi önjavítási események: {recent.length}.
        </p>
      )}

      {recent.length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Még nem volt önjavítási esemény ezen a gépen.
        </p>
      )}
    </Card>
  );
}
