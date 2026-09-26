import { Download, RefreshCw, ChevronRight } from 'lucide-react';

export default function SettingsMenuItems({ t }) {
  const items = [
    { icon: Download, label: t('export_chat') },
    { icon: RefreshCw, label: t('reopen_setup') },
  ];

  return items.map(({ icon: Icon, label }) => (
    <button key={label} className="w-full flex items-center gap-4 bg-card border border-border rounded-2xl p-4 mb-3 hover:bg-secondary transition-all">
      <Icon size={18} className="text-muted-foreground shrink-0" />
      <span className="flex-1 text-left text-sm font-medium text-foreground">{label}</span>
      <ChevronRight size={16} className="text-muted-foreground" />
    </button>
  ));
}