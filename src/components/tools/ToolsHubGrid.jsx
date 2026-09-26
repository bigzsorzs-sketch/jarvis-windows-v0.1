import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, ChevronDown, ChevronUp, Lock, Sparkles } from 'lucide-react';
import { useLang } from '@/lib/i18n';

const PRIMARY_TOOLS = [
  { labelKey: 'tools.finance', bg: 'bg-green-500/10', color: 'text-green-400', path: '/tools/finance', emoji: '💰' },
  { labelKey: 'tools.invoices', bg: 'bg-teal-500/10', color: 'text-teal-400', path: '/tools/invoices', emoji: '📄' },
  { labelKey: 'tools.calendar', bg: 'bg-blue-500/10', color: 'text-blue-400', path: '/tools/calendar', emoji: '📅' },
  { labelKey: 'tools.contacts', bg: 'bg-pink-500/10', color: 'text-pink-400', path: '/contacts', emoji: '👥' },
  { labelKey: 'tools.reminders', bg: 'bg-orange-500/10', color: 'text-orange-400', path: '/reminders', emoji: '⏰' },
  { labelKey: 'tools.smart_home', bg: 'bg-blue-600/10', color: 'text-blue-400', path: '/smarthome', emoji: '🏠' },
  { labelKey: 'tools.automotive', bg: 'bg-yellow-500/10', color: 'text-yellow-400', path: '/automotive', emoji: '🚗' },
  { labelKey: 'tools.live_assistant', bg: 'bg-cyan-500/10', color: 'text-cyan-400', path: '/live-assistant', emoji: '🧑‍🚀' },
  { labelKey: 'tools.memory', bg: 'bg-purple-500/10', color: 'text-purple-400', path: '/memoria', emoji: '🧠' },
];

const ADVANCED_TOOLS = [
  { labelKey: 'tools.translate', color: 'text-indigo-400', path: '/tools/translate', emoji: '🌐' },
  { labelKey: 'tools.quick_actions', color: 'text-yellow-400', path: '/tools/quick', emoji: '⚡' },
  { labelKey: 'tools.routines', color: 'text-purple-400', path: '/routines', emoji: '🔁' },
  { labelKey: 'tools.gmail', color: 'text-red-400', path: '/gmail', emoji: '📧' },
  { labelKey: 'tools.locations', color: 'text-blue-400', path: '/locations', emoji: '📍' },
  { labelKey: 'tools.habits', color: 'text-purple-400', path: '/habits', emoji: '📊' },
  { labelKey: 'tools.fuel_tracker', color: 'text-green-400', path: '/fuel-tracker', emoji: '⛽' },
  { labelKey: 'tools.holding', color: 'text-emerald-400', path: '/holding', emoji: '🏢' },
  { labelKey: 'tools.image_editor', color: 'text-pink-400', path: '/tools/image-editor', emoji: '🖼️', pro: true },
  { labelKey: 'tools.retail', color: 'text-orange-400', path: '/retail', emoji: '🏪', pro: true },
  { labelKey: 'tools.legal', color: 'text-blue-400', path: '/legal', emoji: '⚖️' },
  { labelKey: 'tools.privacy_terms', color: 'text-green-400', path: '/privacy-terms', emoji: '🛡️' },
  { labelKey: 'tools.release_checklist', color: 'text-teal-400', path: '/release-checklist', emoji: '✅' },
  { labelKey: 'tools.reports', color: 'text-purple-400', path: '/jelentesek', emoji: '📈' },
  { labelKey: 'tools.obd2', color: 'text-yellow-400', path: '/obd2', emoji: '🔌', pro: true },
];

export default function ToolsHubGrid() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('tools')}</p>
        <div className="grid grid-cols-4 gap-2">
          {PRIMARY_TOOLS.map(({ labelKey, emoji, bg, color, path }) => (
            <button
              key={labelKey}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center gap-1.5 py-4 rounded-2xl border border-border ${bg} transition-all active:scale-95`}
            >
              <span className="text-2xl">{emoji}</span>
              <span className={`text-[10px] font-semibold ${color} text-center leading-tight`}>{t(labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <button onClick={() => setShowAdvanced(v => !v)} className="w-full flex items-center gap-3 p-4">
          <Sparkles size={16} className="text-primary" />
          <span className="flex-1 text-sm font-semibold text-foreground text-left">{t('more_tools')}</span>
          <span className="text-xs text-muted-foreground mr-2">{ADVANCED_TOOLS.length} {t('available')}</span>
          {showAdvanced ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </button>
        <AnimatePresence>
          {showAdvanced && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t border-border">
              <div className="p-4 grid grid-cols-1 gap-2">
                {ADVANCED_TOOLS.map(({ labelKey, emoji, color, path, pro }) => (
                  <button key={labelKey} onClick={() => navigate(path)} className="w-full flex items-center gap-4 bg-secondary rounded-xl p-3 hover:bg-muted transition-all">
                    <span className="text-xl">{emoji}</span>
                    <span className={`flex-1 text-left text-sm font-medium ${color}`}>{t(labelKey)}</span>
                    {pro && <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"><Lock size={9} /> Pro</span>}
                    <ChevronRight size={14} className="text-muted-foreground" />
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}