import { Lock, Cloud } from 'lucide-react';

export function SecurityCard({ Toggle, t }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <Lock size={16} className="text-yellow-500" />
        <h2 className="text-sm font-semibold text-foreground">{t('security_title')}</h2>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-foreground">{t('security_enc')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('security_enc_desc')}</p>
        </div>
        <Toggle checked={false} onChange={() => {}} />
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
      <p className="text-xs text-muted-foreground mb-4">{t('cloud_sync_desc')}</p>
      <button className="w-full py-3 rounded-2xl bg-accent text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 mb-3">
        <Cloud size={16} /> {t('cloud_sync_enable')}
      </button>
    </div>
  );
}