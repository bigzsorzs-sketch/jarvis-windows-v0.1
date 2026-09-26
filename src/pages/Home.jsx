/**
 * Home – Hero Dashboard
 * "Say it, and it gets done."
 * Role-aware daily summary + quick wins + contextual nudges.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, FileText, Bell, CheckSquare, TrendingUp,
  Droplets, ChevronRight, ArrowRight, Sparkles, Lock, Check
} from 'lucide-react';
import { useVoiceRuntime } from '@/hooks/useVoiceRuntime';
import { invokeWithRetry } from '@/lib/llmGateway';
import { loadFullContext } from '@/lib/assistantTools';
import { useLang } from '@/lib/i18n';
import { getIntelligentReminderSuggestions } from '@/lib/intelligentReminderEngine';
import IntelligentReminderPanel from '@/components/assistant/IntelligentReminderPanel';

// Demo flow config (non-translated parts only; labels/steps come from t())
const DEMO_FLOW_CONFIGS = [
  { id: 'cleaner', emoji: '🧹', color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20',
    labelKey: 'demo_cleaner_label', descKey: 'demo_cleaner_desc', promptKey: 'demo_cleaner_prompt',
    stepKeys: ['demo_step1_cleaner_1','demo_step1_cleaner_2','demo_step1_cleaner_3'] },
  { id: 'driver', emoji: '🚗', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20',
    labelKey: 'demo_driver_label', descKey: 'demo_driver_desc', promptKey: 'demo_driver_prompt',
    stepKeys: ['demo_step1_driver_1','demo_step1_driver_2','demo_step1_driver_3'] },
  { id: 'life', emoji: '🙋', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20',
    labelKey: 'demo_life_label', descKey: 'demo_life_desc', promptKey: 'demo_life_prompt',
    stepKeys: ['demo_step1_life_1','demo_step1_life_2','demo_step1_life_3'] },
];

// ── PLAN TIER KEYS ─────────────────────────────────────────────────────────
const PLAN_TIER_KEYS = [
  { labelKey: 'free_plan', colorClass: 'text-muted-foreground', featureKeys: ['free_f1','free_f2','free_f3'] },
  { labelKey: 'pro_plan', colorClass: 'text-primary', badgeKey: 'most_popular', featureKeys: ['pro_f1','pro_f2','pro_f3','pro_f4','pro_f5'], highlight: true, upgradeKey: 'upgrade_to_pro' },
  { labelKey: 'premium_plan', colorClass: 'text-yellow-400', featureKeys: ['prem_f1','prem_f2','prem_f3','prem_f4','prem_f5'] },
];

// ── QUICK WINS (role-aware) ───────────────────────────────────────────────────
const QUICK_WINS = {
  cleaner: [
    { emoji: '📄', labelKey: 'quick_new_invoice', path: '/tools/invoices', color: 'text-teal-400', bg: 'bg-teal-500/10' },
    { emoji: '✅', labelKey: 'tasks', path: '/eszkozok', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { emoji: '⏰', labelKey: 'reminders', path: '/reminders', color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { emoji: '👥', labelKey: 'contacts', path: '/contacts', color: 'text-pink-400', bg: 'bg-pink-500/10' },
  ],
  driver: [
    { emoji: '🚗', labelKey: 'quick_car_check', path: '/automotive', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { emoji: '💰', labelKey: 'quick_log_expense', path: '/tools/finance', color: 'text-green-400', bg: 'bg-green-500/10' },
    { emoji: '✅', labelKey: 'tasks', path: '/eszkozok', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { emoji: '⏰', labelKey: 'reminders', path: '/reminders', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  ],
  business: [
    { emoji: '📄', labelKey: 'invoices', path: '/tools/invoices', color: 'text-teal-400', bg: 'bg-teal-500/10' },
    { emoji: '💰', labelKey: 'finance', path: '/tools/finance', color: 'text-green-400', bg: 'bg-green-500/10' },
    { emoji: '✅', labelKey: 'tasks', path: '/eszkozok', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { emoji: '📊', labelKey: 'page_reports', path: '/jelentesek', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ],
  personal: [
    { emoji: '🩸', labelKey: 'blood_sugar', path: '/eszkozok', color: 'text-red-400', bg: 'bg-red-500/10' },
    { emoji: '⏰', labelKey: 'reminders', path: '/reminders', color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { emoji: '✅', labelKey: 'tasks', path: '/eszkozok', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { emoji: '💰', labelKey: 'finance', path: '/tools/finance', color: 'text-green-400', bg: 'bg-green-500/10' },
  ],
};

const HERO_EXAMPLE_KEYS = [
  'demo_cleaner_prompt',
  'demo_life_prompt',
  'hero_example_reminder',
  'demo_driver_prompt',
];

// PLAN_TIERS removed — now uses PLAN_TIER_KEYS + t()

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate();
  const voice = useVoiceRuntime();
  const { t, lang } = useLang();

  const [ctx, setCtx] = useState(null);
  const [heroInput, setHeroInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [exampleIdx, setExampleIdx] = useState(0);
  const [role, setRole] = useState(() => localStorage.getItem('jarvis_role') || 'personal');
  const [showDemo, setShowDemo] = useState(null);
  const [showPricing, setShowPricing] = useState(false);
  const [smartSuggestions, setSmartSuggestions] = useState([]);
  const processedVoiceRef = useRef('');

  // Cycle hero examples
  useEffect(() => {
    const timer = setInterval(() => setExampleIdx(i => (i + 1) % HERO_EXAMPLE_KEYS.length), 3000);
    return () => clearInterval(timer);
  }, []);

  // Load context
  useEffect(() => {
    loadFullContext().then(setCtx).catch(() => {});
    getIntelligentReminderSuggestions().then(setSmartSuggestions).catch(() => {});
  }, []);

  const saveRole = (r) => {
    setRole(r);
    localStorage.setItem('jarvis_role', r);
  };

  // ── Hero ask ──────────────────────────────────────────────────────────────
  const handleHeroAsk = useCallback(async (text) => {
    const msg = (text || heroInput).trim();
    if (!msg || loading) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await invokeWithRetry({
        prompt: `You are Jarvis, a helpful voice assistant. The user says: "${msg}"\n\nRespond in 1-2 sentences confirming what you're doing or have done. Be friendly and concise.`,
        model: 'gemini_3_flash',
      });
      const reply = typeof res === 'string' ? res : (res?.data?.result || res?.data || '');
      setResult({ ok: true, message: typeof reply === 'string' ? reply : 'Kérés elküldve.' });
      navigate('/chat', { state: { initialMessage: msg } });
    } catch {
      setResult({ ok: false, message: 'Valami hiba történt. Próbáld meg a chatben.' });
    } finally {
      setLoading(false);
      setHeroInput('');
    }
  }, [heroInput, loading, navigate]);

  useEffect(() => {
    const transcript = voice.lastTranscript?.trim();
    if (!transcript || loading || processedVoiceRef.current === transcript) return;
    processedVoiceRef.current = transcript;
    setHeroInput(transcript);
    handleHeroAsk(transcript);
  }, [voice.lastTranscript, loading, handleHeroAsk]);


  // ── Demo flow ─────────────────────────────────────────────────────────────
  const runDemo = (flow) => {
    navigate('/chat', { state: { initialMessage: t(flow.promptKey) } });
  };

  // ── Contextual alerts ─────────────────────────────────────────────────────
  const alerts = [];
  if (ctx) {
    const unpaidInvoices = ctx.invoices?.filter(i => i.status === 'kiallitva')?.length || 0;
    if (unpaidInvoices > 0) alerts.push({ icon: FileText, color: 'text-orange-400', text: `${unpaidInvoices} ${t('unpaid_invoices')}`, path: '/tools/invoices' });

    const dueTodos = ctx.todos?.filter(td => !td.is_completed)?.length || 0;
    if (dueTodos > 0) alerts.push({ icon: CheckSquare, color: 'text-yellow-400', text: `${dueTodos} ${t('open_tasks')}`, path: '/eszkozok' });

    const dueReminders = ctx.reminders?.filter(r => !r.is_done)?.length || 0;
    if (dueReminders > 0) alerts.push({ icon: Bell, color: 'text-blue-400', text: `${dueReminders} ${t('pending_reminders')}`, path: '/reminders' });

    const lastBs = ctx.bs?.[0];
    if (!lastBs || lastBs.date !== new Date().toISOString().split('T')[0]) {
      alerts.push({ icon: Droplets, color: 'text-red-400', text: t('no_blood_sugar_today'), path: '/eszkozok' });
    }
  }

  const quickWins = QUICK_WINS[role] || QUICK_WINS.personal;

  const handleSmartSuggestion = (suggestion) => {
    if (suggestion.path) {
      navigate(suggestion.path);
      return;
    }
    if (suggestion.mapsQuery) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(suggestion.mapsQuery)}`, '_blank');
      return;
    }
    navigate('/chat', { state: { initialMessage: suggestion.prompt } });
  };

  // ── Finance snapshot ──────────────────────────────────────────────────────
  const income = ctx?.finance?.filter(f => f.type === 'income').reduce((s, f) => s + (f.amount || 0), 0) || 0;
  const expense = ctx?.finance?.filter(f => f.type === 'expense').reduce((s, f) => s + (f.amount || 0), 0) || 0;
  const balance = income - expense;
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background via-background to-secondary/20">
      <div className="px-4 pt-5 pb-24 space-y-5">

        {/* ── ROLE SWITCHER ── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { id: 'cleaner', emoji: '🧹', key: 'role_cleaner' },
            { id: 'driver', emoji: '🚗', key: 'role_driver' },
            { id: 'business', emoji: '💼', key: 'role_business' },
            { id: 'personal', emoji: '🙋', key: 'role_personal' },
          ].map(({ id, emoji, key }) => (
            <button
              key={id}
              onClick={() => saveRole(id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                role === id ? 'bg-primary/20 border-primary text-primary' : 'bg-secondary border-border text-muted-foreground'
              }`}
            >
              {emoji} {t(key)}
            </button>
          ))}
        </div>

        {/* ── HERO BLOCK ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="app-surface p-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-primary font-semibold tracking-wide uppercase">Jarvis</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1">{t('hero_tagline')}</h1>
          <p className="text-sm text-muted-foreground mb-4">{t('hero_sub')}</p>

          {/* Input row */}
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-secondary rounded-2xl px-4 py-3 border border-border">
              <input
                aria-label={t(HERO_EXAMPLE_KEYS[exampleIdx])}
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                placeholder={t(HERO_EXAMPLE_KEYS[exampleIdx])}
                value={heroInput}
                onChange={e => setHeroInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleHeroAsk()}
              />
            </div>
            <button
              onClick={() => voice.state.isListening ? voice.setHandsFree(false) : voice.setHandsFree(true)}
              aria-label={voice.state.isListening ? t('cancel') : t('listening')}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shrink-0 focus-visible:ring-2 focus-visible:ring-primary ${
                voice.state.isListening ? 'bg-red-500 animate-pulse' : 'bg-primary'
              }`}
            >
              {voice.state.isListening ? <MicOff size={18} className="text-white" /> : <Mic size={18} className="text-primary-foreground" />}
            </button>
          </div>

          {loading && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              {t('jarvis_handling')}
            </div>
          )}

          {result && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mt-3 rounded-2xl px-4 py-3 text-sm ${result.ok ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}
            >
              {result.ok ? '✅ ' : '❌ '}{result.message}
            </motion.div>
          )}

          <button
            onClick={() => navigate('/chat')}
            aria-label={t('open_full_assistant')}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-2xl bg-primary text-primary-foreground font-semibold text-sm focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Mic size={15} /> {t('open_full_assistant')}
          </button>
        </motion.div>

        <IntelligentReminderPanel suggestions={smartSuggestions} onSelect={handleSmartSuggestion} />

        {/* ── CONTEXTUAL ALERTS ── */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => navigate(a.path)}
                className="w-full flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3 text-left transition-all hover:border-primary/30 active:scale-[0.99]"
              >
                <a.icon size={16} className={a.color} />
                <span className="flex-1 text-sm text-foreground">{a.text}</span>
                <ChevronRight size={14} className="text-muted-foreground" />
              </motion.button>
            ))}
          </div>
        )}

        {/* ── QUICK WINS ── */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('quick_actions')}</p>
          <div className="grid grid-cols-4 gap-2">
            {quickWins.map((w, i) => (
              <motion.button
                key={w.labelKey}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => navigate(w.path)}
                className={`flex flex-col items-center gap-1.5 py-4 rounded-2xl border border-border ${w.bg} transition-all active:scale-95`}
              >
                <span className="text-2xl">{w.emoji}</span>
                <span className={`text-[10px] font-semibold ${w.color} text-center leading-tight`}>{t(w.labelKey)}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* ── DAILY SUMMARY ── */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('todays_summary')}</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => navigate('/tools/finance')} className="bg-card border border-border rounded-2xl p-4 text-left transition-all hover:border-primary/30 active:scale-[0.99]">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-primary" />
                <span className="text-xs text-muted-foreground">{t('balance')}</span>
              </div>
              <p className={`text-xl font-bold ${balance >= 0 ? 'text-primary' : 'text-destructive'}`}>
                £{Math.abs(balance).toFixed(0)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{balance >= 0 ? t('net_income') : t('net_expense')}</p>
            </button>

            <button onClick={() => navigate('/eszkozok')} className="bg-card border border-border rounded-2xl p-4 text-left transition-all hover:border-primary/30 active:scale-[0.99]">
              <div className="flex items-center gap-2 mb-2">
                <CheckSquare size={14} className="text-yellow-400" />
                <span className="text-xs text-muted-foreground">{t('tasks')}</span>
              </div>
              <p className="text-xl font-bold text-yellow-400">{ctx?.todos?.filter(td => !td.is_completed).length ?? '–'}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{t('open_tasks')}</p>
            </button>

            <button onClick={() => navigate('/reminders')} className="bg-card border border-border rounded-2xl p-4 text-left transition-all hover:border-primary/30 active:scale-[0.99]">
              <div className="flex items-center gap-2 mb-2">
                <Bell size={14} className="text-blue-400" />
                <span className="text-xs text-muted-foreground">{t('reminders')}</span>
              </div>
              <p className="text-xl font-bold text-blue-400">{ctx?.reminders?.filter(r => !r.is_done).length ?? '–'}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{t('pending')}</p>
            </button>

            <button onClick={() => navigate('/eszkozok')} className="bg-card border border-border rounded-2xl p-4 text-left transition-all hover:border-primary/30 active:scale-[0.99]">
              <div className="flex items-center gap-2 mb-2">
                <Droplets size={14} className="text-red-400" />
                <span className="text-xs text-muted-foreground">{t('blood_sugar')}</span>
              </div>
              <p className="text-xl font-bold text-red-400">
                {ctx?.bs?.find(b => b.date === todayStr)?.value ?? '–'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">mmol/L {t('today')}</p>
            </button>
          </div>
        </div>

        {/* ── EXAMPLE USES ── */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('see_in_action')}</p>
          <div className="space-y-3">
            {DEMO_FLOW_CONFIGS.map(flow => (
              <motion.div key={flow.id} layout className={`rounded-2xl border ${flow.border} ${flow.bg}`}>
                <button
                  onClick={() => setShowDemo(showDemo === flow.id ? null : flow.id)}
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  <span className="text-2xl">{flow.emoji}</span>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${flow.color}`}>{t(flow.labelKey)}</p>
                    <p className="text-xs text-muted-foreground">{t(flow.descKey)}</p>
                  </div>
                  <ChevronRight size={14} className={`text-muted-foreground transition-transform ${showDemo === flow.id ? 'rotate-90' : ''}`} />
                </button>

                <AnimatePresence>
                  {showDemo === flow.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-3">
                        <div className="bg-background/50 rounded-xl px-3 py-2.5 border border-white/5">
                          <p className="text-xs text-muted-foreground mb-0.5">{t('you_say')}</p>
                          <p className="text-sm text-foreground italic">{t(flow.promptKey)}</p>
                        </div>
                        <div className="space-y-1">
                          {flow.stepKeys.map((sk, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${flow.bg} ${flow.color}`}>{i + 1}</div>
                              {t(sk)}
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => runDemo(flow)}
                          className={`w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 ${flow.bg} ${flow.color} border ${flow.border}`}
                        >
                          <Mic size={14} /> {t('try_this_now')} <ArrowRight size={12} />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── PRICING TEASER ── */}
        <div>
          <button
            onClick={() => setShowPricing(v => !v)}
            className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-2xl"
          >
            <div className="flex items-center gap-3">
              <Sparkles size={16} className="text-primary" />
              <div className="text-left">
                <p className="text-sm font-semibold text-foreground">{t('unlock_full')}</p>
                <p className="text-xs text-muted-foreground">{t('unlock_sub')}</p>
              </div>
            </div>
            <ChevronRight size={14} className={`text-muted-foreground transition-transform ${showPricing ? 'rotate-90' : ''}`} />
          </button>

          <AnimatePresence>
            {showPricing && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="pt-3 space-y-3">
                  {PLAN_TIER_KEYS.map(tier => (
                    <div key={tier.labelKey} className={`rounded-2xl border p-4 ${tier.highlight ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className={`font-bold text-base ${tier.colorClass}`}>{t(tier.labelKey)}</span>
                        {tier.badgeKey && <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-semibold">{t(tier.badgeKey)}</span>}
                      </div>
                      <div className="space-y-1.5">
                        {tier.featureKeys.map(fk => (
                          <div key={fk} className="flex items-center gap-2 text-xs text-muted-foreground">
                            {tier.labelKey === 'free_plan' ? <Lock size={11} className="text-border" /> : <Check size={11} className={tier.colorClass} />}
                            {t(fk)}
                          </div>
                        ))}
                      </div>
                      {tier.highlight && (
                        <button className="mt-3 w-full py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold">
                          {t('upgrade_to_pro')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}