import React from 'react';
import { Phone, Navigation, MessageSquareText } from 'lucide-react';

const commands = [
  { icon: Phone, label: 'Hívás', color: 'bg-primary/20 text-primary border-primary/30' },
  { icon: Navigation, label: 'Navigáció', color: 'bg-accent/20 text-accent border-accent/30' },
  { icon: MessageSquareText, label: 'Kérdés', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
];

export default function QuickCommands({ onCommand }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        Gyors parancsok:
      </p>
      <div className="flex gap-3">
        {commands.map(({ icon: Icon, label, color }) => (
          <button
            key={label}
            onClick={() => onCommand(label)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full border text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${color}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}