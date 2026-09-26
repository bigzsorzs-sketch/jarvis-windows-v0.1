export default function PersonalizationCard({ settings, personalities, ageGroups, interestInput, setInterestInput, onUpdate, onSave, onAddInterest, onRemoveInterest, t }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-4">
      <h2 className="text-sm font-semibold text-foreground mb-4">{t('personalization')}</h2>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-muted-foreground w-20">{t('your_name')}</span>
        <input className="flex-1 bg-secondary rounded-xl px-3 py-2 text-sm text-foreground text-right outline-none border border-primary/50" placeholder={t('required')} value={settings.user_name || ''} onChange={e => onUpdate({ user_name: e.target.value })} />
      </div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-muted-foreground w-20">{t('ai_name')}</span>
        <input className="flex-1 bg-secondary rounded-xl px-3 py-2 text-sm text-foreground text-right outline-none border border-border" value={settings.ai_name} onChange={e => onUpdate({ ai_name: e.target.value })} />
      </div>

      <OptionGroup title={t('personality')} options={personalities} active={settings.personality} onSelect={(key) => onSave({ personality: key })} />
      <OptionGroup title={t('age_group')} options={ageGroups} active={settings.age_group} onSelect={(key) => onSave({ age_group: key })} />

      <div className="mb-4">
        <p className="text-sm text-muted-foreground mb-2">{t('interests')}</p>
        <input className="w-full bg-secondary rounded-xl px-3 py-2 text-sm text-foreground outline-none border border-border mb-2" placeholder={t('add_interest')} value={interestInput} onChange={e => setInterestInput(e.target.value)} onKeyDown={onAddInterest} />
        <div className="flex flex-wrap gap-2">
          {(settings.interests || []).map(interest => (
            <button key={interest} onClick={() => onRemoveInterest(interest)} className="px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium">
              {interest} ×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function OptionGroup({ title, options, active, onSelect }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(({ key, label }) => (
          <button key={key} onClick={() => onSelect(key)} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${active === key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}