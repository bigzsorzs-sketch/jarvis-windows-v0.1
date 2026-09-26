import { ThumbsDown, MessageSquare } from 'lucide-react';

export default function FeedbackCard({ feedback }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-red-400 text-sm font-semibold">
          <ThumbsDown size={15} /> Gyenge válasz • {feedback.rating}/5
        </div>
        <span className="text-[11px] text-muted-foreground">{new Date(feedback.created_date).toLocaleDateString('hu-HU')}</span>
      </div>
      {feedback.user_message && (
        <div className="rounded-xl bg-secondary p-3">
          <p className="text-[11px] text-muted-foreground mb-1">Felhasználó</p>
          <p className="text-sm text-foreground line-clamp-4">{feedback.user_message}</p>
        </div>
      )}
      <div className="rounded-xl bg-secondary/70 p-3">
        <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1"><MessageSquare size={11} /> AI válasz</p>
        <p className="text-sm text-foreground line-clamp-5">{feedback.assistant_reply}</p>
      </div>
    </div>
  );
}