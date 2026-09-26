import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, BarChart3, Brain, Wrench, Settings } from 'lucide-react';

const navItems = [
  { path: '/chat', icon: MessageSquare, label: 'Chat' },
  { path: '/muszerfal', icon: BarChart3, label: 'Műszerfal' },
  { path: '/memoria', icon: Brain, label: 'Memória' },
  { path: '/eszkozok', icon: Wrench, label: 'Eszközök' },
  { path: '/beallitasok', icon: Settings, label: 'Beállítások' },
];

export default function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border">
      <div className="flex items-center justify-around max-w-lg mx-auto px-2 py-2">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all duration-200 min-w-[44px] min-h-[44px] justify-center ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}