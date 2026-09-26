import { Globe } from 'lucide-react';
import ChannelPreferenceCard from '@/components/settings/ChannelPreferenceCard';

export default function PersonalServicesCard({ lang, userChannelPrefs, onToggle }) {
  const services = [
    ['messenger', 'Messenger', lang === 'hu' ? 'Későbbi saját Messenger kapcsolat előkészítése.' : 'Prepare a future personal Messenger connection.'],
    ['whatsapp', 'WhatsApp', lang === 'hu' ? 'Saját WhatsApp használati szándék mentése.' : 'Save preference for personal WhatsApp usage.'],
    ['gmail', 'Gmail', lang === 'hu' ? 'Saját email integráció használata.' : 'Use a personal email integration.'],
    ['navigation', lang === 'hu' ? 'Navigáció' : 'Navigation', lang === 'hu' ? 'Google Maps és útvonal fókusz engedélyezése.' : 'Enable Google Maps and route-focused features.'],
    ['voice_drive_mode', lang === 'hu' ? 'Vezetési hangmód' : 'Driving voice mode', lang === 'hu' ? 'Hands-free, autós használat előnyben részesítése.' : 'Prefer hands-free driving usage.'],
  ];

  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Globe size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{lang === 'hu' ? 'Saját szolgáltatások' : 'Personal services'}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{lang === 'hu' ? 'Itt minden felhasználó maga döntheti el, mely funkciókat és csatornákat akarja használni.' : 'Each user can choose which functions and channels they want to use here.'}</p>
      {services.map(([key, title, description]) => (
        <ChannelPreferenceCard
          key={key}
          title={title}
          description={description}
          checked={userChannelPrefs.includes(key)}
          onToggle={() => onToggle(key)}
        />
      ))}
    </div>
  );
}