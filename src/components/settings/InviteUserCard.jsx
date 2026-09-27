import { UserPlus, ShieldAlert } from 'lucide-react';

export default function InviteUserCard({ t }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <UserPlus size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{t('invite_user')}</h2>
      </div>
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldAlert size={14} className="text-yellow-400 shrink-0 mt-0.5" />
        <p>Ez a Windows kiadás helyi, egytulajdonos módot használ. Többfelhasználós meghívás addig nincs felkínálva működő funkcióként, amíg valódi hitelesítési backend nem áll rendelkezésre.</p>
      </div>
    </div>
  );
}
