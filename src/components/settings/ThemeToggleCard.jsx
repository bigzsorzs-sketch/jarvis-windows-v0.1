import { Sun, Moon } from 'lucide-react';

export default function ThemeToggleCard({ darkMode, onToggle, Toggle, t }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {darkMode ? <Moon size={18} className="text-blue-400" /> : <Sun size={18} className="text-yellow-400" />}
          <div>
            <p className="text-sm font-semibold text-foreground">{darkMode ? t('dark_mode') : t('light_mode')}</p>
            <p className="text-xs text-muted-foreground">{t('theme_toggle')}</p>
          </div>
        </div>
        <Toggle checked={darkMode} onChange={onToggle} />
      </div>
    </div>
  );
}