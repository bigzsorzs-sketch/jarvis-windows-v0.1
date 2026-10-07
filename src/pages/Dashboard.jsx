import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { jarvis } from '@/api/jarvisClient';
import { Card } from '@/components/ui/card';
import { MessageSquare, Brain, CheckSquare, TrendingUp, Clock, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

const StatCard = ({ icon: Icon, label, value, color, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
  >
    <Card className="bg-card border-border p-4 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  </motion.div>
);

export default function Dashboard() {
  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const user = await jarvis.auth.me();
      const rows = user?.email ? await jarvis.entities.Conversation.filter({ created_by: user.email }) : [];
      return rows.filter(row => row.source !== 'chat-deletion');
    },
    initialData: [],
  });

  const { data: memories } = useQuery({
    queryKey: ['memories'],
    queryFn: async () => {
      const user = await jarvis.auth.me();
      return user?.email ? jarvis.entities.Memory.filter({ created_by: user.email }) : [];
    },
    initialData: [],
  });

  const { data: todos } = useQuery({
    queryKey: ['todos'],
    queryFn: async () => {
      const user = await jarvis.auth.me();
      return user?.email ? jarvis.entities.TodoItem.filter({ created_by: user.email }) : [];
    },
    initialData: [],
  });

  const completedTodos = todos.filter(t => t.is_completed).length;

  const stats = [
    { icon: MessageSquare, label: 'Beszélgetések', value: conversations.length, color: 'bg-primary/20 text-primary' },
    { icon: Brain, label: 'Memória elemek', value: memories.length, color: 'bg-accent/20 text-accent' },
    { icon: CheckSquare, label: 'Elvégzett teendők', value: completedTodos, color: 'bg-green-500/20 text-green-400' },
    { icon: TrendingUp, label: 'Összes teendő', value: todos.length, color: 'bg-yellow-500/20 text-yellow-400' },
    { icon: Clock, label: 'Ma aktív', value: new Date().toLocaleDateString('hu-HU'), color: 'bg-purple-500/20 text-purple-400' },
    { icon: Zap, label: 'AI státusz', value: 'Aktív', color: 'bg-primary/20 text-primary' },
  ];

  return (
    <div className="px-5 pt-6 pb-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Műszerfal</h1>
            <p className="text-xs text-muted-foreground">Áttekintés és statisztikák</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat, i) => (
          <StatCard key={stat.label} {...stat} delay={i * 0.08} />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="bg-card border-border p-5 mt-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Legutóbbi tevékenység</h2>
          {todos.length === 0 && memories.length === 0 ? (
            <p className="text-xs text-muted-foreground">Még nincs tevékenység. Kezdj el beszélgetni az AI asszisztenssel!</p>
          ) : (
            <div className="space-y-2">
              {todos.slice(0, 3).map(todo => (
                <div key={todo.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
                  <CheckSquare className={`w-4 h-4 ${todo.is_completed ? 'text-green-400' : 'text-muted-foreground'}`} />
                  <span className={`text-sm ${todo.is_completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {todo.title}
                  </span>
                </div>
              ))}
              {memories.slice(0, 2).map(mem => (
                <div key={mem.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
                  <Brain className="w-4 h-4 text-accent" />
                  <span className="text-sm text-foreground truncate">{mem.content}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
