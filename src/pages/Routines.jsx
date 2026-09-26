import { useState, useEffect } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { RefreshCw, Plus, X, Play, Trash2, Clock, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';
import MobileSelect from '@/components/common/MobileSelect';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ENV_TOOLS } from '@/lib/environmentTools';
import { generateDailySummary, detectPatterns } from '@/lib/behaviorEngine';
import { useLang } from '@/lib/i18n';
import { updateOwnedEntity, deleteOwnedEntity } from '@/lib/ownedEntityHelpers';
import PullToRefresh from '@/components/common/PullToRefresh';

const TRIGGER_LABELS = {
  hu: {
    manual: '🖱️ Manuális',
    morning: '☀️ Reggeli',
    evening: '🌙 Esti',
    leaving: '🚪 Elhagyáskor',
    arriving: '🏠 Hazaérkezéskor',
    work_done: '✅ Munka befejezésekor',
  },
  en: {
    manual: '🖱️ Manual',
    morning: '☀️ Morning',
    evening: '🌙 Evening',
    leaving: '🚪 On leaving',
    arriving: '🏠 On arrival',
    work_done: '✅ After work',
  }
};

const DEFAULT_ROUTINES = [
  {
    name: 'Napi összesítő',
    trigger: 'evening',
    steps: [{ tool: 'daily_summary', params: {} }],
    is_active: true,
  },
  {
    name: 'Reggeli rutin',
    trigger: 'morning',
    steps: [{ tool: 'check_device_status', params: { device_name: 'all' } }],
    is_active: true,
  },
  {
    name: 'Elhagyás – otthon',
    trigger: 'leaving',
    steps: [
      { tool: 'trigger_scene', params: { scene_name: 'Elhagyás' } },
    ],
    is_active: true,
  },
];

export default function Routines() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const [routines, setRoutines] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [running, setRunning] = useState(null);
  const [result, setResult] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', trigger: 'manual' });

  useEffect(() => {
    jarvis.auth.me()
      .then((currentUser) => {
        if (!currentUser?.email) throw new Error('auth_required');
        return Promise.all([
          jarvis.entities.Routine.filter({ created_by: currentUser.email }),
          detectPatterns(),
        ]);
      })
      .then(([routineRows, detectedPatterns]) => {
        setRoutines(routineRows);
        setPatterns(detectedPatterns);
      })
      .catch(() => {
        setRoutines([]);
        setPatterns([]);
      });
  }, []);

  const createDefaults = async () => {
    for (const r of DEFAULT_ROUTINES) {
      const exists = routines.find(rt => rt.name === r.name);
      if (!exists) {
        const currentUser = await jarvis.auth.me().catch(() => null);
        if (!currentUser?.email) return;
        const created = await jarvis.entities.Routine.create({ ...r, created_by: currentUser.email });
        setRoutines(prev => [...prev, created]);
      }
    }
  };

  const runRoutine = async (routine) => {
    setRunning(routine.id);
    setResult('');

    const results = [];
    for (const step of (routine.steps || [])) {
      if (step.tool === 'daily_summary') {
        const summary = await generateDailySummary();
        results.push(`📊 Ma: ${summary.completedTodos} feladat kész, ${summary.pendingTodos} nyitott | ${summary.todayCalories} kcal | Vércukor: ${summary.bsReadings} mérés | Műveletek: ${summary.todayActions}`);
      } else if (ENV_TOOLS[step.tool]) {
        const r = await ENV_TOOLS[step.tool](step.params);
        results.push(r.message);
      }
    }

    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email || routine.created_by !== currentUser.email) {
      setResult('A saját rutinjaid futtatásához be kell jelentkezned.');
      setRunning(null);
      return;
    }
    await updateOwnedEntity(jarvis.entities.Routine, routine.id, {
      last_run: new Date().toISOString(),
      run_count: (routine.run_count || 0) + 1,
    });
    setRoutines(prev => prev.map(r => r.id === routine.id ? { ...r, last_run: new Date().toISOString(), run_count: (r.run_count || 0) + 1 } : r));
    setResult(results.join('\n'));
    setRunning(null);
  };

  const toggleActive = async (routine) => {
    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email || routine.created_by !== currentUser.email) return;
    await updateOwnedEntity(jarvis.entities.Routine, routine.id, { is_active: !routine.is_active });
    setRoutines(prev => prev.map(r => r.id === routine.id ? { ...r, is_active: !r.is_active } : r));
  };

  const deleteRoutine = async (id) => {
    const currentUser = await jarvis.auth.me().catch(() => null);
    const routine = routines.find((item) => item.id === id);
    if (!currentUser?.email || routine?.created_by !== currentUser.email) return;
    await deleteOwnedEntity(jarvis.entities.Routine, id);
    setRoutines(prev => prev.filter(r => r.id !== id));
  };

  const addRoutine = async () => {
    if (!form.name.trim()) return;
    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email) {
      setResult('A saját rutinjaid létrehozásához be kell jelentkezned.');
      return;
    }
    const created = await jarvis.entities.Routine.create({ ...form, created_by: currentUser.email, steps: [], is_active: true, run_count: 0 });
    setRoutines(prev => [...prev, created]);
    setForm({ name: '', trigger: 'manual' });
    setShowAdd(false);
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <PullToRefresh onRefresh={async () => {
        const currentUser = await jarvis.auth.me().catch(() => null);
        if (!currentUser?.email) return;
        const [routineRows, detectedPatterns] = await Promise.all([
          jarvis.entities.Routine.filter({ created_by: currentUser.email }),
          detectPatterns(),
        ]);
        setRoutines(routineRows);
        setPatterns(detectedPatterns);
      }}>
      <div className="px-4 pt-5 pb-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <ArrowLeft size={16} className="text-muted-foreground" />
          </button>
          <div className="w-9 h-9 rounded-2xl bg-purple-500/20 flex items-center justify-center">
            <RefreshCw size={18} className="text-purple-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">{t('routines_title')}</h1>
            <p className="text-xs text-muted-foreground">{t('routines_sub')}</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <Plus size={14} className="text-primary-foreground" />
          </button>
        </div>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-primary/10 border border-primary/30 rounded-2xl px-4 py-3 text-sm text-primary whitespace-pre-line">
              {result}
              <button onClick={() => setResult('')} className="block mt-2 text-xs text-muted-foreground">{t('close')}</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Detected patterns */}
        {patterns.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">{t('detected_patterns')}</p>
            <div className="space-y-1">
              {patterns.map(p => (
                <div key={p.type} className="flex items-center justify-between">
                  <span className="text-xs text-foreground">{p.type.replace('_', ' ')}</span>
                  <span className="text-xs text-primary font-mono">{p.count}×</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Routines */}
        {routines.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-2xl p-6 text-center">
            <RefreshCw size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">{t('no_routines')}</p>
            <button onClick={createDefaults} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
              {t('add_default_routines')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {routines.map(routine => (
              <div key={routine.id} className={`bg-card border rounded-2xl p-4 transition-all ${routine.is_active ? 'border-border' : 'border-border/40 opacity-60'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{routine.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{TRIGGER_LABELS[lang]?.[routine.trigger] || TRIGGER_LABELS.en[routine.trigger] || routine.trigger}</span>
                      {routine.run_count > 0 && <span className="text-xs text-muted-foreground">· {routine.run_count} {t('run_count')}</span>}
                    </div>
                    {routine.last_run && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t('last_run')} {new Date(routine.last_run).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleActive(routine)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${routine.is_active ? 'bg-primary/10' : 'bg-secondary'}`}>
                      <CheckCircle2 size={14} className={routine.is_active ? 'text-primary' : 'text-muted-foreground'} />
                    </button>
                    <button onClick={() => runRoutine(routine)} disabled={running === routine.id}
                      className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                      {running === routine.id
                        ? <Loader2 size={14} className="text-white animate-spin" />
                        : <Play size={12} className="text-primary-foreground" />
                      }
                    </button>
                    <button onClick={() => deleteRoutine(routine.id)} className="text-muted-foreground/40 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {routine.steps?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {routine.steps.map((s, i) => (
                      <span key={i} className="px-2 py-0.5 bg-secondary rounded-full text-xs text-muted-foreground">{s.tool}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      </PullToRefresh>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-end">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-semibold text-foreground">{t('new_routine')}</h2>
                <button onClick={() => setShowAdd(false)}><X size={18} className="text-muted-foreground" /></button>
              </div>
              <div className="space-y-3">
                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
                  placeholder={t('routine_name_placeholder')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <MobileSelect
                  value={form.trigger}
                  onChange={v => setForm(f => ({ ...f, trigger: v }))}
                  options={Object.entries(TRIGGER_LABELS[lang] || TRIGGER_LABELS.en).map(([k, v]) => ({ value: k, label: v }))}
                  placeholder={t('trigger_placeholder')}
                />
                <button onClick={addRoutine} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold">{t('create')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}