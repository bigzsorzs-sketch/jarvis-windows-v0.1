import { UserPlus } from 'lucide-react';

export default function InviteUserCard({ lang, inviteEmail, setInviteEmail, inviting, inviteStatus, onInvite, t }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <UserPlus size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{t('invite_user')}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{lang === 'hu' ? 'Hívj meg valakit az appba – ő csak a saját adatait fogja látni.' : lang === 'es' ? 'Invita a alguien a la app – solo verá sus propios datos.' : lang === 'de' ? 'Lade jemanden ein – er sieht nur seine eigenen Daten.' : lang === 'fr' ? 'Invitez quelqu\'un dans l\'app – il verra uniquement ses données.' : 'Invite someone to the app – they\'ll only see their own data.'}</p>
      <div className="flex gap-2">
        <input className="flex-1 bg-secondary rounded-xl px-3 py-2 text-sm text-foreground outline-none border border-border" placeholder="email@example.com" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && onInvite()} />
        <button onClick={onInvite} disabled={inviting || !inviteEmail.trim()} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${inviteStatus === 'sent' ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'bg-primary text-primary-foreground disabled:opacity-40'}`}>
          {inviteStatus === 'sent' ? t('invite_sent_btn') : inviting ? t('invite_sending') : t('invite_btn')}
        </button>
      </div>
    </div>
  );
}