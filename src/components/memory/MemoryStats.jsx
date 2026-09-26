import { Brain, Link2, Star } from 'lucide-react';

export default function MemoryStats({ memories }) {
  const linkedCount = memories.filter((item) => item.linked_entity_id).length;
  const highValueCount = memories.filter((item) => (item.importance || 0) >= 8).length;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-card border border-border rounded-2xl p-4">
        <Brain className="w-4 h-4 text-primary mb-2" />
        <p className="text-2xl font-bold text-foreground">{memories.length}</p>
        <p className="text-xs text-muted-foreground">Memories</p>
      </div>
      <div className="bg-card border border-border rounded-2xl p-4">
        <Link2 className="w-4 h-4 text-blue-400 mb-2" />
        <p className="text-2xl font-bold text-foreground">{linkedCount}</p>
        <p className="text-xs text-muted-foreground">Linked</p>
      </div>
      <div className="bg-card border border-border rounded-2xl p-4">
        <Star className="w-4 h-4 text-yellow-400 mb-2" />
        <p className="text-2xl font-bold text-foreground">{highValueCount}</p>
        <p className="text-xs text-muted-foreground">High priority</p>
      </div>
    </div>
  );
}