import { useNavigate } from 'react-router-dom';
import { jarvis } from '@/api/jarvisClient';
import { useState } from 'react';
import { Download, RefreshCw, ChevronRight } from 'lucide-react';

export default function SettingsMenuItems({ t }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const exportChat = async () => {
    try {
      const user = await jarvis.auth.me();
      if (!user?.email) throw new Error('Bejelentkezés szükséges.');
      const conversations = (await jarvis.entities.Conversation.filter({ created_by:user.email }, '-created_date'))
        .filter(row => row.source !== 'chat-deletion');
      const blob = new Blob([JSON.stringify(conversations, null, 2)], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'jarvis-conversations.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError('');
    } catch (err) { setError(err?.message || 'Az exportálás nem sikerült.'); }
  };
  const items = [
    { icon: Download, label: t('export_chat'), onClick:exportChat },
    { icon: RefreshCw, label: t('reopen_setup'), onClick:() => navigate('/', { state:{ reopenSetup:true } }) },
  ];

  return <>{error && <p role="alert">{error}</p>}{items.map(({ icon: Icon, label, onClick }) => (
    <button key={label} onClick={onClick} className="w-full flex items-center gap-4 bg-card border border-border rounded-2xl p-4 mb-3 hover:bg-secondary transition-all">
      <Icon size={18} className="text-muted-foreground shrink-0" />
      <span className="flex-1 text-left text-sm font-medium text-foreground">{label}</span>
      <ChevronRight size={16} className="text-muted-foreground" />
    </button>
  ))}</>;
}
