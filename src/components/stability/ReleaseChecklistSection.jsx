import ReleaseChecklistItem from './ReleaseChecklistItem';

export default function ReleaseChecklistSection({ title, items }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">{title}</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <ReleaseChecklistItem key={item.title} {...item} />
        ))}
      </div>
    </section>
  );
}