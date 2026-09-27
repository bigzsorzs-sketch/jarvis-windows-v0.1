import { Lock, Cloud, CheckCircle2, AlertTriangle } from 'lucide-react';

export function SecurityCard({ t }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <Lock size={16} className="text-yellow-500" />
        <h2 className="text-sm font-semibold text-foreground">{t('security_title')}</h2>
      </div>
      <div className="flex items-start gap-3">
        <CheckCircle2 size={18} className="text-green-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-foreground">{t('security_enc')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Windows alatt az API-kulcsok Electron safeStorage/DPAPI védelemmel vannak tárolva. Ez biztonsági alapbeállítás, ezért nem kapcsolható ki a felületről.
          </p>
        </div>
      </div>
    </div>
  );
}

export function CloudSyncCard({ t }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Cloud size={16} className="text-blue-400" />
        <h2 className="text-sm font-semibold text-foreground">{t('cloud_sync_title')}</h2>
      </div>
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
        <p>A felhőszinkron nincs engedélyezve ebben a local-first Windows buildben. A funkció addig nem jelenik meg aktívként, amíg nincs valódi backend és hitelesítés.</p>
      </div>
    </div>
  );
}
