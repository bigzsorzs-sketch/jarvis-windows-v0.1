import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { jarvis } from '@/api/jarvisClient';
import { Card } from '@/components/ui/card';
import { motion } from 'framer-motion';
import {
  DollarSign,
  FileText,
  CalendarDays,
  Globe,
  Zap,
  HeartPulse,
  ChevronRight,
  Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const tools = [
  { icon: DollarSign, label: 'Pénzügy', desc: 'Költségek és bevételek', color: 'bg-green-500/20 text-green-400', path: '/tools/finance' },
  { icon: FileText, label: 'Számlák', desc: 'Számla kezelés', color: 'bg-blue-500/20 text-blue-400', path: '/tools/invoices' },
  { icon: CalendarDays, label: 'Naptár', desc: 'Események és emlékeztetők', color: 'bg-primary/20 text-primary', path: '/tools/calendar' },
  { icon: Globe, label: 'Fordító', desc: 'Azonnali fordítás', color: 'bg-cyan-500/20 text-cyan-400', path: '/tools/translate' },
  { icon: Zap, label: 'Gyors műveletek', desc: 'Egyéb hasznos eszközök', color: 'bg-yellow-500/20 text-yellow-400', path: '/tools/quick' },
  { icon: HeartPulse, label: 'Egészség trendek', desc: 'Egészségi állapot figyelés', color: 'bg-rose-500/20 text-rose-400', path: '/jelentesek' },
];

export default function Tools() {
  const { data: todos } = useQuery({
    queryKey: ['todos'],
    queryFn: async () => {
      const user = await jarvis.auth.me();
      return user?.email ? jarvis.entities.TodoItem.filter({ created_by: user.email }) : [];
    },
    initialData: [],
  });

  const pendingTodos = todos.filter(t => !t.is_completed).length;

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <Wrench className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Eszközök</h1>
          <p className="text-xs text-muted-foreground">{pendingTodos} teendő · 0 gyógyszer</p>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {tools.map(({ icon: Icon, label, desc, color, path }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Link to={path}>
              <Card className="bg-card border-border p-4 flex items-center gap-4 hover:bg-secondary/50 transition-colors cursor-pointer">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}