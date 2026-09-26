export default function MemoryFilters({ search, setSearch, category, setCategory, linkType, setLinkType }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value.slice(0, 100))}
        placeholder="Search memories..."
        className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none"
      />
      <div className="grid grid-cols-2 gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none">
          <option value="all">All categories</option>
          <option value="preference">Preference</option>
          <option value="fact">Fact</option>
          <option value="habit">Habit</option>
          <option value="interest">Interest</option>
          <option value="other">Other</option>
        </select>
        <select value={linkType} onChange={(e) => setLinkType(e.target.value)} className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none">
          <option value="all">All links</option>
          <option value="unlinked">Unlinked</option>
          <option value="contact">Contacts</option>
          <option value="project">Projects</option>
        </select>
      </div>
    </div>
  );
}