import { LayoutGrid } from 'lucide-react';

export default function ToolsPageHeader({ title, pendingTodos, activeMeds, t }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center">
        <LayoutGrid size={20} className="text-primary" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="text-xs text-muted-foreground">{pendingTodos} {t('open_tasks')} · {activeMeds} {t('medication')}</p>
      </div>
    </div>
  );
}