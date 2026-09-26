import { Globe } from 'lucide-react';

const Toggle = ({ checked, onChange }) => (
  <button
    onClick={() => onChange(!checked)}
    className={`relative w-12 h-6 rounded-full transition-all ${checked ? 'bg-primary' : 'bg-secondary border border-border'}`}
  >
    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${checked ? 'left-6' : 'left-0.5'}`} />
  </button>
);

export default function BehaviorProfileSection({ behaviorProfile, onSaveBehaviorProfile, onToggleCommandLanguage }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Globe size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Viselkedési profil</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Itt finomhangolhatod, hogyan beszéljen és hogyan értse a hangparancsokat az asszisztens.</p>

      <div className="mb-4">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Közvetlenség</p>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'soft', label: 'Visszafogott' },
            { key: 'balanced', label: 'Kiegyensúlyozott' },
            { key: 'direct', label: 'Egyenes' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => onSaveBehaviorProfile({ directness: key })}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${behaviorProfile.directness === key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Szóhasználat</p>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'clean', label: 'Letisztult' },
            { key: 'natural', label: 'Természetes' },
            { key: 'street', label: 'Lazább' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => onSaveBehaviorProfile({ vocabulary: key })}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${behaviorProfile.vocabulary === key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">Kötetlenebb beszélgetési mód</p>
            <p className="text-xs text-muted-foreground">Emberibb, lazább, kevésbé steril hangnem.</p>
          </div>
          <Toggle checked={behaviorProfile.casual_mode} onChange={(val) => onSaveBehaviorProfile({ casual_mode: val })} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">Megengedett trágár kifejezések</p>
            <p className="text-xs text-muted-foreground">Csak kötetlenebb módban, helyzettől függően.</p>
          </div>
          <Toggle checked={behaviorProfile.allow_swearing} onChange={(val) => onSaveBehaviorProfile({ allow_swearing: val })} />
        </div>
      </div>

      <div>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Hangparancs nyelvek</p>
        <div className="flex flex-wrap gap-2">
          {[
            { code: 'hu', label: 'Magyar' },
            { code: 'en', label: 'English' },
            { code: 'de', label: 'Deutsch' },
            { code: 'fr', label: 'Français' },
            { code: 'es', label: 'Español' },
            { code: 'it', label: 'Italiano' },
            { code: 'ro', label: 'Română' },
            { code: 'pl', label: 'Polski' },
          ].map(({ code, label }) => (
            <button key={code} onClick={() => onToggleCommandLanguage(code)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${behaviorProfile.command_languages.includes(code) ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}