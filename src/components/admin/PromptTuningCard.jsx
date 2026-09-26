import { CheckCircle2, XCircle } from 'lucide-react';

export default function PromptTuningCard({ tuning, onApprove, onReject }) {
  const isActive = tuning.status === 'active';
  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${isActive ? 'border-primary/40 bg-primary/10' : 'border-border bg-card'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">{tuning.title}</h3>
          <p className="text-xs text-muted-foreground mt-1">{tuning.reason}</p>
        </div>
        <span className="text-[11px] rounded-full bg-secondary px-2 py-1 text-muted-foreground">{tuning.status}</span>
      </div>
      <div className="rounded-xl bg-secondary p-3 text-sm text-foreground whitespace-pre-wrap">
        {tuning.proposed_instruction}
      </div>
      {tuning.status === 'pending' && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onApprove(tuning)} className="rounded-xl bg-primary text-primary-foreground py-2 text-sm font-semibold flex items-center justify-center gap-2">
            <CheckCircle2 size={15} /> Jóváhagyás
          </button>
          <button onClick={() => onReject(tuning)} className="rounded-xl bg-secondary text-foreground py-2 text-sm font-semibold flex items-center justify-center gap-2">
            <XCircle size={15} /> Elutasítás
          </button>
        </div>
      )}
    </div>
  );
}