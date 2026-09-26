import { useMemo, useState } from 'react';
import { Boxes, LockKeyhole, PlugZap } from 'lucide-react';
import { listExtensions, setExtensionEnabled } from '@/lib/pluginRegistry';

export default function ExtensionsCard({ lang = 'hu' }) {
  const [revision, setRevision] = useState(0);
  const extensions = useMemo(() => listExtensions(), [revision]);

  const toggle = (extension) => {
    if (extension.required) return;
    try {
      setExtensionEnabled(extension.id, !extension.enabled);
      setRevision((value) => value + 1);
    } catch {}
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Boxes size={17} className="text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">
            {lang === 'hu' ? 'Bővítmények és képességek' : 'Extensions & capabilities'}
          </h3>
          <p className="text-xs text-muted-foreground">
            {lang === 'hu'
              ? 'A Jarvis képességei modulárisan csatlakoznak ugyanahhoz a hangos és helyzetfelismerő maghoz.'
              : 'Jarvis capabilities plug into the same contextual voice core.'}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {extensions.map((extension) => (
          <div key={extension.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
            <div className="shrink-0">
              {extension.required ? <LockKeyhole size={15} className="text-muted-foreground" /> : <PlugZap size={15} className="text-primary" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate">{extension.name}</p>
                <span className="text-[10px] text-muted-foreground">{extension.version}</span>
              </div>
              <p className="text-xs text-muted-foreground">{extension.description}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{extension.status}</p>
            </div>
            <button
              type="button"
              onClick={() => toggle(extension)}
              disabled={extension.required}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                extension.enabled ? 'bg-green-500/15 text-green-400' : 'bg-secondary text-muted-foreground'
              } disabled:opacity-70`}
            >
              {extension.enabled ? (lang === 'hu' ? 'Aktív' : 'On') : (lang === 'hu' ? 'Kikapcsolva' : 'Off')}
            </button>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground mt-3">
        {lang === 'hu'
          ? 'Külső bővítmény kódja nem fut automatikusan: csak ellenőrzött Jarvis release vagy megbízható provider-réteg adhat végrehajtható képességet.'
          : 'External extension code is never executed automatically; executable capabilities require a reviewed Jarvis release or trusted provider boundary.'}
      </p>
    </div>
  );
}
