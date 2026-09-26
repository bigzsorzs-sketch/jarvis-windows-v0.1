export default function AiBehaviorCard({ settings, labels, Toggle, onSave, t }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-4">
      <h2 className="text-sm font-semibold text-foreground mb-4">{t('ai_behavior')}</h2>
      {labels.map(({ key, label }) => (
        <div key={key} className="flex items-center justify-between py-3 border-b border-border last:border-0">
          <span className="text-sm text-foreground">{label}</span>
          <Toggle checked={!!settings[key]} onChange={val => onSave({ [key]: val })} />
        </div>
      ))}
    </div>
  );
}