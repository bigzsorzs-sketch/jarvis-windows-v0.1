import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react';

export default function ReleaseChecklistItem({ title, description, status = 'ready' }) {
  const statusConfig = {
    ready: { icon: CheckCircle2, className: 'text-green-400 bg-green-500/10 border-green-500/30', label: 'Rendben' },
    review: { icon: AlertTriangle, className: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30', label: 'Ellenőrizd' },
    manual: { icon: Circle, className: 'text-blue-400 bg-blue-500/10 border-blue-500/30', label: 'Kézi teszt' },
  }[status] || {};

  const Icon = statusConfig.icon || Circle;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${statusConfig.className}`}>
          <Icon size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap">{statusConfig.label}</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
    </div>
  );
}