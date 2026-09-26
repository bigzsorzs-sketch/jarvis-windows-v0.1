import MobileSelect from '@/components/common/MobileSelect';

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All categories' },
  { value: 'preference', label: 'Preference' },
  { value: 'fact', label: 'Fact' },
  { value: 'habit', label: 'Habit' },
  { value: 'interest', label: 'Interest' },
  { value: 'other', label: 'Other' },
];

const LINK_OPTIONS = [
  { value: 'all', label: 'All links' },
  { value: 'unlinked', label: 'Unlinked' },
  { value: 'contact', label: 'Contacts' },
  { value: 'project', label: 'Projects' },
];

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
        <MobileSelect value={category} onChange={setCategory} options={CATEGORY_OPTIONS} placeholder="Category" />
        <MobileSelect value={linkType} onChange={setLinkType} options={LINK_OPTIONS} placeholder="Links" />
      </div>
    </div>
  );
}