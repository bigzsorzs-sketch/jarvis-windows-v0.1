import { Phone, Navigation } from 'lucide-react';

export default function QuickActionButtons({ onCall, onNavigate, t }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button onClick={onCall} className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-semibold">
        <Phone size={16} /> {t('call')}
      </button>
      <button onClick={onNavigate} className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-semibold">
        <Navigation size={16} /> {t('navigation')}
      </button>
    </div>
  );
}