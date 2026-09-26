import { Settings, Save, Check } from 'lucide-react';

export default function SettingsPageHeader({ title, saved, onSave, t }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center">
        <Settings size={20} className="text-primary" />
      </div>
      <h1 className="text-xl font-bold text-foreground flex-1">{title}</h1>
      <button
        onClick={onSave}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${saved ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'bg-primary text-primary-foreground'}`}
      >
        {saved ? <><Check size={15} /> {t('saved')}</> : <><Save size={15} /> {t('save')}</>}
      </button>
    </div>
  );
}