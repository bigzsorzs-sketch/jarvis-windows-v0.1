import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jarvis } from '@/api/jarvisClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Brain, Plus, Trash2, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';

const categoryLabels = {
  preference: 'Preferencia',
  fact: 'Tény',
  habit: 'Szokás',
  interest: 'Érdeklődés',
  other: 'Egyéb',
};

const categoryColors = {
  preference: 'bg-primary/20 text-primary border-primary/30',
  fact: 'bg-accent/20 text-accent border-accent/30',
  habit: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  interest: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  other: 'bg-muted text-muted-foreground border-border',
};

export default function MemoryPage() {
  const [newMemory, setNewMemory] = useState('');
  const queryClient = useQueryClient();

  const { data: memories, isLoading } = useQuery({
    queryKey: ['memories'],
    queryFn: async () => {
      const user = await jarvis.auth.me();
      return user?.email ? jarvis.entities.Memory.filter({ created_by: user.email }, '-created_date') : [];
    },
    initialData: [],
  });

  const createMutation = useMutation({
    mutationFn: (data) => jarvis.entities.Memory.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      setNewMemory('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => jarvis.entities.Memory.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memories'] }),
  });

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newMemory.trim()) return;
    createMutation.mutate({ content: newMemory, category: 'other' });
  };

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
          <Brain className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Memória</h1>
          <p className="text-xs text-muted-foreground">{memories.length} megjegyzett elem</p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 mb-5">
        <Input
          value={newMemory}
          onChange={(e) => setNewMemory(e.target.value)}
          placeholder="Új memória hozzáadása..."
          className="flex-1 bg-secondary border-border rounded-full px-4 text-sm"
        />
        <Button type="submit" size="icon" className="rounded-full bg-primary hover:bg-primary/90 flex-shrink-0">
          <Plus className="w-4 h-4" />
        </Button>
      </form>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : memories.length === 0 ? (
        <div className="text-center py-16">
          <Brain className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Még nincsenek memória elemek.</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Adj hozzá manuálisan, vagy beszélgess az AI-jal!</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {memories.map((mem, i) => (
              <motion.div
                key={mem.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card className="bg-card border-border p-4 flex items-start gap-3">
                  <Tag className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-relaxed">{mem.content}</p>
                    <Badge variant="outline" className={`mt-2 text-[10px] ${categoryColors[mem.category || 'other']}`}>
                      {categoryLabels[mem.category || 'other']}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0 text-muted-foreground hover:text-destructive h-8 w-8"
                    onClick={() => deleteMutation.mutate(mem.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}