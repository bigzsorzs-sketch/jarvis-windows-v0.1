export default function ChannelPreferenceCard({ title, description, checked, onToggle }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={`relative w-12 h-6 rounded-full transition-all shrink-0 ${checked ? 'bg-primary' : 'bg-secondary border border-border'}`}
      >
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${checked ? 'left-6' : 'left-0.5'}`} />
      </button>
    </div>
  );
}