import { Sun, Moon, Monitor } from 'lucide-react';

export default function ThemeToggleCard({ themeMode, onChange, t }) {
  const options = [
    { key:'light', label:'Világos', Icon:Sun },
    { key:'dark', label:'Sötét', Icon:Moon },
    { key:'system', label:'Rendszer', Icon:Monitor },
  ];
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-4">
      <p className="text-sm font-semibold text-foreground">{t?.('theme_toggle') || 'Megjelenés'}</p>
      <p className="text-xs text-muted-foreground mt-1 mb-3">A változás azonnal érvénybe lép az egész Jarvis felületen.</p>
      <div className="grid grid-cols-3 gap-2">
        {options.map(({key,label,Icon}) => <button key={key} onClick={()=>onChange(key)}
          className={`rounded-xl border px-3 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 ${themeMode===key?'bg-primary/15 border-primary/40 text-primary':'bg-background border-border text-muted-foreground'}`}>
          <Icon size={15}/>{label}
        </button>)}
      </div>
    </div>
  );
}
