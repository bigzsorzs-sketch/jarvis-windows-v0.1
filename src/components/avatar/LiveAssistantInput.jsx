import { Loader2, Send } from 'lucide-react';

export default function LiveAssistantInput({ value, onChange, onSubmit, busy }) {
  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2 rounded-2xl bg-card border border-border p-2 shadow-lg shadow-black/10">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Írj üzenetet Jarvisnak..."
        className="flex-1 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
        disabled={busy}
      />
      <button
        type="submit"
        disabled={!value.trim() || busy}
        className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
      </button>
    </form>
  );
}