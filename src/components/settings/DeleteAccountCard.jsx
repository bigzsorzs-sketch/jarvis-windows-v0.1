import { Trash2 } from 'lucide-react';

export default function DeleteAccountCard({ lang, onOpen, t }) {
  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Trash2 size={16} className="text-red-400" />
        <h2 className="text-sm font-semibold text-red-400">{t('delete_account')}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {lang === 'hu' ? 'Ez a művelet visszafordíthatatlan. Az összes adatod törlődik.' : 'This action is irreversible. All your data will be deleted.'}
      </p>
      <button onClick={onOpen} className="w-full py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold flex items-center justify-center gap-2">
        <Trash2 size={15} /> {t('delete_account')}
      </button>
    </div>
  );
}