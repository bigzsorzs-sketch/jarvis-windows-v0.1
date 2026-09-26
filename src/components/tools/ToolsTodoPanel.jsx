import { X } from 'lucide-react';

const PRIORITIES = [
  ['alacsony', 'low', 'text-muted-foreground'],
  ['kozepes', 'medium', 'text-yellow-400'],
  ['surgos', 'urgent', 'text-red-400'],
];

export default function ToolsTodoPanel({ todos, newTodo, priority, setNewTodo, setPriority, onAdd, onToggle, onDelete, t }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">✅ {t('todos')}</h2>
      <input
        className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground mb-3"
        placeholder={t('add_todo')}
        value={newTodo}
        onChange={e => setNewTodo(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onAdd()}
      />
      <div className="flex gap-2 mb-3">
        {PRIORITIES.map(([key, labelKey, cls]) => (
          <button key={key} onClick={() => setPriority(key)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${priority === key ? 'bg-primary border-primary text-primary-foreground' : `border-border bg-secondary ${cls}`}`}>
            {t(labelKey)}
          </button>
        ))}
      </div>
      <button onClick={onAdd} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold mb-3">+ {t('add_task')}</button>
      <div className="space-y-2">
        {todos.map(todo => (
          <div key={todo.id} className="flex items-center gap-3">
            <button onClick={() => onToggle(todo)} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${todo.is_completed ? 'bg-primary border-primary' : 'border-border'}`}>
              {todo.is_completed && <div className="w-2 h-2 bg-primary-foreground rounded-full" />}
            </button>
            <span className={`flex-1 text-sm ${todo.is_completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{todo.title}</span>
            <button onClick={() => onDelete(todo.id)} className="text-muted-foreground/50 hover:text-destructive"><X size={14} /></button>
          </div>
        ))}
        {todos.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">{t('no_todos')}</p>}
      </div>
    </div>
  );
}