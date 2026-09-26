import { useState, useEffect } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { Brain, RefreshCw, Loader2, TrendingUp, Calendar, Clock, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { syncHabits, getProactiveHabitSuggestions } from '@/lib/habitEngine';
import { useLang } from '@/lib/i18n';

const DAY_NAMES = {
  hu: ['Vasárnap', 'Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
};

export default function HabitsPage() {
  const { t, lang } = useLang();
  const [patterns, setPatterns] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [stats, setStats] = useState({ totalPatterns: 0, weeklyCount: 0, dailyCount: 0 });

  const load = async () => {
    const currentUser = await jarvis.auth.me().catch(() => null);
    const userFilter = currentUser?.email ? { created_by: currentUser.email } : {};
    const [p, s] = await Promise.all([
      jarvis.entities.HabitPattern.filter(userFilter, '-confidence').catch(() => []),
      getProactiveHabitSuggestions().catch(() => []),
    ]);
    setPatterns(p);
    setSuggestions(s);
    setStats({
      totalPatterns: p.length,
      weeklyCount: p.filter(x => x.pattern_type === 'weekly').length,
      dailyCount: p.filter(x => x.pattern_type === 'daily').length,
    });
    setLoading(false);
  };

  const runSync = async () => {
    setSyncing(true);
    await syncHabits();
    await load();
    setSyncing(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="px-4 pt-5 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-purple-500/20 flex items-center justify-center">
            <Brain size={20} className="text-purple-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">{t('page_habits')}</h1>
            <p className="text-xs text-muted-foreground">{t('habits_subtitle')}</p>
          </div>
          <button onClick={runSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-muted-foreground text-xs border border-border">
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {t('habits_analyze')}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: t('habits_total_patterns'), value: stats.totalPatterns, icon: Brain, color: 'text-purple-400', bg: 'bg-purple-400/10' },
            { label: t('habits_weekly'), value: stats.weeklyCount, icon: Calendar, color: 'text-blue-400', bg: 'bg-blue-400/10' },
            { label: t('habits_daily'), value: stats.dailyCount, icon: Clock, color: 'text-green-400', bg: 'bg-green-400/10' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-card border border-border rounded-2xl p-3 text-center">
              <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center mx-auto mb-2`}>
                <Icon size={15} className={color} />
              </div>
              <p className="text-xl font-bold text-foreground">{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Proactive suggestions */}
        {suggestions.length > 0 && (
          <div className="bg-card border border-primary/30 rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={14} className="text-primary" />
              <p className="text-xs font-semibold text-primary">{t('habits_current_suggestions')}</p>
            </div>
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <p key={i} className="text-xs text-foreground">{s}</p>
              ))}
            </div>
          </div>
        )}

        {/* Info */}
        <div className="bg-card border border-purple-500/20 rounded-2xl p-4 mb-4">
          <p className="text-xs text-purple-400 font-semibold mb-1">🧠 {t('habits_how_title')}</p>
          <p className="text-xs text-muted-foreground">{t('habits_how_desc')}</p>
        </div>

        {/* Pattern list */}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="text-primary animate-spin" /></div>
        ) : patterns.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Brain size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t('habits_empty')}</p>
            <p className="text-xs mt-2">{t('habits_empty_hint')}</p>
            <button onClick={runSync} disabled={syncing}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold mx-auto">
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
              {t('habits_run_now')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('detected_patterns')}</p>
            {patterns.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${p.pattern_type === 'weekly' ? 'bg-blue-400/10' : 'bg-green-400/10'}`}>
                    {p.pattern_type === 'weekly' ? <Calendar size={15} className="text-blue-400" /> : <Clock size={15} className="text-green-400" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{p.activity}</p>
                    {p.day_of_week !== undefined && p.day_of_week !== null && (
                      <p className="text-xs text-muted-foreground">{lang === 'hu' ? `${DAY_NAMES.hu[p.day_of_week]}onként` : `Every ${DAY_NAMES.en[p.day_of_week]}`}</p>
                    )}
                    {p.time_of_day && <p className="text-xs text-muted-foreground">{lang === 'hu' ? `${p.time_of_day} körül` : `Around ${p.time_of_day}`}</p>}
                    <p className="text-xs text-muted-foreground">{p.occurrence_count}× {t('habits_occurrences')}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }, (_, j) => (
                        <div key={j} className={`w-1.5 h-1.5 rounded-full ${j < Math.round((p.confidence || 1) / 2) ? 'bg-primary' : 'bg-border'}`} />
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{t('habits_confidence')}</span>
                  </div>
                </div>
                {p.suggestion && (
                  <p className="text-xs text-muted-foreground mt-2 pl-11">💡 {p.suggestion}</p>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}