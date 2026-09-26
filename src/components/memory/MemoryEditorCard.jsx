import { Trash2 } from 'lucide-react';
import MobileSelect from '@/components/common/MobileSelect';

const CATEGORY_OPTIONS = [
  { value: 'preference', label: 'Preference' },
  { value: 'fact', label: 'Fact' },
  { value: 'habit', label: 'Habit' },
  { value: 'interest', label: 'Interest' },
  { value: 'other', label: 'Other' },
];

const IMPORTANCE_OPTIONS = [1,2,3,4,5,6,7,8,9,10].map((num) => ({ value: num, label: `Priority ${num}` }));

const LINK_TYPE_OPTIONS = [
  { value: '', label: 'No link' },
  { value: 'contact', label: 'Contact' },
  { value: 'project', label: 'Project' },
];

const badgeStyles = {
  preference: 'bg-blue-500/20 text-blue-400',
  fact: 'bg-green-500/20 text-green-400',
  habit: 'bg-orange-500/20 text-orange-400',
  interest: 'bg-purple-500/20 text-purple-400',
  other: 'bg-muted text-muted-foreground',
};

export default function MemoryEditorCard({ memory, contacts, projects, onSave, onDelete }) {
  const options = memory.linked_entity_type === 'project' ? projects : contacts;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <textarea
          value={memory.content}
          onChange={(e) => onSave(memory.id, { content: e.target.value.slice(0, 500) })}
          className="flex-1 min-h-[92px] bg-secondary border border-border rounded-xl p-3 text-sm text-foreground outline-none resize-none"
        />
        <button onClick={() => onDelete(memory.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
          <Trash2 size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MobileSelect value={memory.category || 'other'} onChange={(value) => onSave(memory.id, { category: value })} options={CATEGORY_OPTIONS} placeholder="Category" />
        <MobileSelect value={memory.importance || 5} onChange={(value) => onSave(memory.id, { importance: Number(value) })} options={IMPORTANCE_OPTIONS} placeholder="Priority" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MobileSelect
          value={memory.linked_entity_type || ''}
          onChange={(value) => onSave(memory.id, {
            linked_entity_type: value || null,
            linked_entity_id: null,
            linked_entity_name: null,
          })}
          options={LINK_TYPE_OPTIONS}
          placeholder="Link type"
        />
        <MobileSelect
          value={memory.linked_entity_id || ''}
          onChange={(value) => {
            const selected = options.find((item) => item.id === value);
            onSave(memory.id, {
              linked_entity_id: selected?.id || null,
              linked_entity_name: selected?.name || null,
            });
          }}
          disabled={!memory.linked_entity_type}
          placeholder={`Select ${memory.linked_entity_type || 'entity'}`}
          options={[
            { value: '', label: `Select ${memory.linked_entity_type || 'entity'}` },
            ...options.map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${badgeStyles[memory.category] || badgeStyles.other}`}>
          {memory.category || 'other'}
        </span>
        <div className="text-xs text-muted-foreground">
          {memory.linked_entity_name ? `Linked to ${memory.linked_entity_name}` : 'Not linked'}
        </div>
      </div>
    </div>
  );
}