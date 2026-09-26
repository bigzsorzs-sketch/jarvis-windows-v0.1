import { Car, MapPinned, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { useLang } from '@/lib/i18n';

export default function DrivingModeBanner({ drivingMode, routeWatch, onOpenNav, onToggleRouteWatch, trackingMode, queueStats, syncStatus, gpsStatus, onRetrySync, onSelectTrackingMode }) {
  const { t } = useLang();
  if (!drivingMode) return null;

  return (
    <div className="px-4 pt-3">
      <div className="bg-card border border-primary/30 rounded-2xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Car size={18} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{t('driving_mode_active')}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('driving_mode_desc')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={onOpenNav}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
          >
            <MapPinned size={15} /> {t('driving_open_maps')}
          </button>
          <button
            onClick={onToggleRouteWatch}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border ${routeWatch ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' : 'bg-secondary border-border text-foreground'}`}
          >
            <AlertTriangle size={15} />
            {routeWatch ? t('driving_route_watch_active') : t('driving_route_watch_start')}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {['LOW_POWER', 'BALANCED', 'HIGH_ACCURACY'].map((mode) => (
            <button
              key={mode}
              onClick={() => onSelectTrackingMode?.(mode)}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold ${trackingMode === mode ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground'}`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="rounded-xl bg-secondary p-3 text-xs text-muted-foreground space-y-1">
          <p>{routeWatch ? t('driving_route_watch_active') : t('driving_battery_safe')}</p>
          <p>{syncStatus === 'syncing' ? t('driving_sync_in_progress') : queueStats?.pending ? t('driving_offline_sync') : t('driving_saved')}</p>
          <p>{gpsStatus === 'weak_accuracy' ? t('driving_gps_weak') : t('driving_gps_stable')}</p>
          {(queueStats?.failed || 0) > 0 && (
            <button onClick={onRetrySync} className="mt-2 inline-flex items-center gap-1 text-primary">
              <RefreshCw size={12} /> {t('driving_retry_sync')}
            </button>
          )}
        </div>

        <div className="bg-secondary rounded-xl p-3 text-xs text-muted-foreground space-y-1">
          <p>• {t('driving_tip_1')}</p>
          <p>• {t('driving_tip_2')}</p>
          <div className="flex items-center gap-1 text-primary pt-1">
            <ExternalLink size={12} />
            <span>{t('driving_mvp_label')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}