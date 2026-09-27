import { MessageCircle, BarChart3, Sparkles, MapPin, HeartPulse } from 'lucide-react';

const ACTIONS = [
  { icon: MessageCircle, label: 'Chat', hint: 'Get answers', path: '/chat' },
  { icon: BarChart3, label: 'Analyze', hint: 'Find insights', path: '/muszerfal' },
  { icon: Sparkles, label: 'Create', hint: 'Generate anything', path: '/eszkozok' },
  { icon: Sparkles, label: 'Plan', hint: 'Turn ideas into action', path: '/reminders' },
  { icon: MapPin, label: 'Navigate', hint: 'Get you there', path: '/locations' },
  { icon: HeartPulse, label: 'Take care', hint: 'Support your health', path: '/eszkozok' },
];

export default function CommandCenterActions({ onNavigate }) {
  return (
    <div className="jarvis-command-actions">
      {ACTIONS.map(({ icon: Icon, label, hint, path }) => (
        <button key={label} type="button" onClick={() => onNavigate(path)} className="jarvis-command-action">
          <Icon size={18} />
          <span><strong>{label}</strong><small>{hint}</small></span>
        </button>
      ))}
    </div>
  );
}
