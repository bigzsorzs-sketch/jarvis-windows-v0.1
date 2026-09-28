import { BarChart3, Sparkles, MapPin, HeartPulse } from 'lucide-react';
import { useLang } from '@/lib/i18n';

export default function CommandCenterActions({ onNavigate }) {
  const { lang } = useLang();
  const hu = lang === 'hu';
  const actions = [
    { icon: BarChart3, label: hu ? 'Elemzés' : 'Analyse', hint: hu ? 'Találj összefüggéseket' : 'Find insights', path: '/muszerfal' },
    { icon: Sparkles, label: hu ? 'Alkotás' : 'Create', hint: hu ? 'Hozz létre bármit' : 'Generate anything', path: '/eszkozok' },
    { icon: Sparkles, label: hu ? 'Tervezés' : 'Plan', hint: hu ? 'Ötletből feladat' : 'Turn ideas into action', path: '/reminders' },
    { icon: MapPin, label: hu ? 'Navigáció' : 'Navigate', hint: hu ? 'Eljuttatlak oda' : 'Get you there', path: '/locations' },
    { icon: HeartPulse, label: hu ? 'Gondoskodás' : 'Take care', hint: hu ? 'Egészség támogatása' : 'Support your health', path: '/eszkozok' },
  ];

  return (
    <div className="jarvis-command-actions">
      {actions.map(({ icon: Icon, label, hint, path }) => (
        <button key={label} type="button" onClick={() => onNavigate(path)} className="jarvis-command-action">
          <Icon size={18} />
          <span><strong>{label}</strong><small>{hint}</small></span>
        </button>
      ))}
    </div>
  );
}
