import { useLang } from '@/lib/i18n';

export default function ActiveRouteCard({ activeRoute, onFinishTrip }) {
  const { t } = useLang();

  if (!activeRoute) return null;

  return (
    <div className="mx-4 mt-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
      <p className="text-sm font-semibold text-blue-400">Aktív út: {activeRoute.contact_name}</p>
      <button
        onClick={onFinishTrip}
        className="mt-2 rounded-xl bg-blue-500 px-3 py-2 text-xs font-semibold text-white"
      >
        {t('driving_finish_trip')}
      </button>
    </div>
  );
}