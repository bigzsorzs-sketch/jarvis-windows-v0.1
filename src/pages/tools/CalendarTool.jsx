import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jarvis } from '@/api/jarvisClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, CalendarDays, Plus, CheckSquare, Square, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { updateOwnedEntity, deleteOwnedEntity } from '@/lib/ownedEntityHelpers';
import { useLang } from '@/lib/i18n';

export default function CalendarTool() {
  const [newTitle, setNewTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const queryClient = useQueryClient();
  const { t } = useLang();

  const { data: todos } = useQuery({
    queryKey: ['todos'],
    queryFn: async () => {
      const user = await jarvis.auth.me();
      return user?.email ? jarvis.entities.TodoItem.filter({ created_by: user.email }, '-created_date') : [];
    },
    initialData: [],
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const currentUser = await jarvis.auth.me().catch(() => null);
      if (!currentUser?.email) throw new Error(t('generic_load_error'));
      return jarvis.entities.TodoItem.create({ ...data, created_by: currentUser.email });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      setNewTitle('');
      setDueDate('');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_completed }) => updateOwnedEntity(jarvis.entities.TodoItem, id, { is_completed }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteOwnedEntity(jarvis.entities.TodoItem, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
  });

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createMutation.mutate({ title: newTitle, due_date: dueDate || undefined, category: 'calendar' });
  };

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/eszkozok" className="p-2 -ml-2 rounded-lg hover:bg-secondary">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        <CalendarDays className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">{t('calendar_todos_title')}</h1>
      </div>

      <form onSubmit={handleAdd} className="space-y-2 mb-5">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={t('calendar_new_todo_placeholder')}
          className="bg-secondary border-border rounded-xl"
        />
        <div className="flex gap-2">
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="bg-secondary border-border rounded-xl flex-1"
          />
          <Button type="submit" className="bg-primary hover:bg-primary/90 rounded-xl">
            <Plus className="w-4 h-4 mr-1" /> {t('calendar_add')}
          </Button>
        </div>
      </form>

      <div className="space-y-2">
        <AnimatePresence>
          {todos.map((todo, i) => (
            <motion.div
              key={todo.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ delay: i * 0.03 }}
            >
              <Card className="bg-card border-border p-3 flex items-center gap-3">
                <button onClick={() => toggleMutation.mutate({ id: todo.id, is_completed: !todo.is_completed })}>
                  {todo.is_completed ? (
                    <CheckSquare className="w-5 h-5 text-primary" />
                  ) : (
                    <Square className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${todo.is_completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {todo.title}
                  </p>
                  {todo.due_date && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{todo.due_date}</p>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate(todo.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
        {todos.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-10">{t('calendar_empty')}</p>
        )}
      </div>
    </div>
  );
}