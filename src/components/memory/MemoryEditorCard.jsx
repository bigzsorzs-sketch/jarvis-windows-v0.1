import { Trash2 } from 'lucide-react';

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
        <select value={memory.category || 'other'} onChange={(e) => onSave(memory.id, { category: e.target.value })} className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none">
          <option value="preference">Preference</option>
          <option value="fact">Fact</option>
          <option value="habit">Habit</option>
          <option value="interest">Interest</option>
          <option value="other">Other</option>
        </select>
        <select value={memory.importance || 5} onChange={(e) => onSave(memory.id, { importance: Number(e.target.value) })} className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none">
          {[1,2,3,4,5,6,7,8,9,10].map((num) => <option key={num} value={num}>Priority {num}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={memory.linked_entity_type || ''}
          onChange={(e) => onSave(memory.id, {
            linked_entity_type: e.target.value || null,
            linked_entity_id: null,
            linked_entity_name: null,
          })}
          className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none"
        >
          <option value="">No link</option>
          <option value="contact">Contact</option>
          <option value="project">Project</option>
        </select>
        <select
          value={memory.linked_entity_id || ''}
          onChange={(e) => {
            const selected = options.find((item) => item.id === e.target.value);
            onSave(memory.id, {
              linked_entity_id: selected?.id || null,
              linked_entity_name: selected?.name || null,
            });
          }}
          disabled={!memory.linked_entity_type}
          className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none disabled:opacity-50"
        >
          <option value="">Select {memory.linked_entity_type || 'entity'}</option>
          {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
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