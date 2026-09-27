import { useState, useEffect } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { useLang } from '@/lib/i18n';
import { FileBarChart, Loader2, RefreshCw, Droplets, UtensilsCrossed, CheckSquare, Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';



const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>)}
      </div>
    );
  }
  return null;
};

function StatBadge({ value, avg, unit }) {
  if (value === null || avg === null) return null;
  const diff = value - avg;
  if (Math.abs(diff) < 0.1) return <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Minus size={11} /> átlag</span>;
  const better = diff > 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs ${better ? 'text-primary' : 'text-red-400'}`}>
      {better ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(diff).toFixed(1)}{unit}
    </span>
  );
}

export default function Jelentesek() {
  const { t, lang } = useLang();
  const [bloodSugars, setBloodSugars] = useState([]);
  const [meals, setMeals] = useState([]);
  const [todos, setTodos] = useState([]);
  const [report, setReport] = useState('');
  const [tips, setTips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const weekAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  })();

  useEffect(() => {
    jarvis.auth.me()
      .then((user) => {
        if (!user?.email) throw new Error('auth_required');
        return Promise.all([
          jarvis.entities.BloodSugar.filter({ created_by: user.email }, '-date', 50),
          jarvis.entities.MealLog.filter({ created_by: user.email }, '-date', 50),
          jarvis.entities.TodoItem.filter({ created_by: user.email }, '-created_date', 50),
        ]);
      })
      .then(([bs, ml, tod]) => {
        setBloodSugars(bs.filter(b => b.date >= weekAgo));
        setMeals(ml.filter(m => m.date >= weekAgo));
        setTodos(tod);
      })
      .finally(() => setDataLoaded(true));
  }, [weekAgo]);

  const avgBS = bloodSugars.length > 0
    ? (bloodSugars.reduce((s, b) => s + b.value, 0) / bloodSugars.length).toFixed(1)
    : null;

  const totalCalories = meals.reduce((s, m) => s + (m.calories || 0), 0);
  const avgDailyCalories = meals.length > 0 ? Math.round(totalCalories / 7) : null;

  const completedTodos = todos.filter(t => t.is_completed).length;
  const totalTodos = todos.length;

  // Chart data: last 7 days
  const chartData = (() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const dayName = ['V', 'H', 'K', 'Sz', 'Cs', 'P', 'Szo'][d.getDay()];
      const dayBS = bloodSugars.filter(b => b.date === key);
      const dayMeals = meals.filter(m => m.date === key);
      days.push({
        nap: dayName,
        vércukor: dayBS.length ? parseFloat((dayBS.reduce((s, b) => s + b.value, 0) / dayBS.length).toFixed(1)) : null,
        kalória: dayMeals.reduce((s, m) => s + (m.calories || 0), 0) || null,
      });
    }
    return days;
  })();

  const generateReport = async () => {
    setLoading(true);
    setReport('');
    setTips([]);

    const summary = `
Heti adatok (elmúlt 7 nap):
- Átlag vércukor: ${avgBS ? avgBS + ' mmol/L' : 'nincs adat'} (${bloodSugars.length} mérés)
- Napi átlag kalória: ${avgDailyCalories ? avgDailyCalories + ' kcal' : 'nincs adat'} (${meals.length} étkezés)
- Elvégzett feladatok: ${completedTodos}/${totalTodos}
- Étkezések részletei: ${meals.slice(0, 10).map(m => m.meal_name).join(', ') || 'nincs'}
- Vércukor értékek: ${bloodSugars.slice(0, 7).map(b => b.value + ' (' + b.time_of_day + ')').join(', ') || 'nincs'}
    `.trim();

    const response = await jarvis.functions.invoke('runAiTask', {
      prompt: `Te egy kedves, bíztató magyar egészség-coach AI vagy. Az alábbi heti adatok alapján írj:
1. Egy személyre szabott, POZITÍV hangvételű heti értékelést (3-4 mondat, magyarul, "Te" megszólítással, konkrét számokra hivatkozva)
2. Pontosan 3 konkrét, megvalósítható tippet a következő hétre

Adatok:
${summary}

Válaszolj ebben a JSON formátumban:
{
  "report": "heti értékelés szövege",
  "tips": ["tipp 1", "tipp 2", "tipp 3"]
}`,
      response_json_schema: {
        type: 'object',
        properties: {
          report: { type: 'string' },
          tips: { type: 'array', items: { type: 'string' } }
        }
      }
    });

    const parsed = response.data?.result || {};
    setReport(parsed.report || '');
    setTips(parsed.tips || []);
    setLoading(false);
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="px-4 pt-5 pb-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center">
            <FileBarChart size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{t('reports_title')}</h1>
            <p className="text-xs text-muted-foreground">{t('reports_sub')}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-card border border-border rounded-2xl p-3 flex flex-col items-center">
            <Droplets size={16} className="text-red-400 mb-1" />
            <p className="text-lg font-bold text-foreground">{avgBS ?? '–'}</p>
            <p className="text-[10px] text-muted-foreground text-center">{t('avg_blood_sugar')}</p>
            <p className="text-[10px] text-muted-foreground">{bloodSugars.length} {t('measurements')}</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-3 flex flex-col items-center">
            <UtensilsCrossed size={16} className="text-green-400 mb-1" />
            <p className="text-lg font-bold text-foreground">{avgDailyCalories ?? '–'}</p>
            <p className="text-[10px] text-muted-foreground text-center">{t('daily_kcal_avg')}</p>
            <p className="text-[10px] text-muted-foreground">{meals.length} {t('meals_count')}</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-3 flex flex-col items-center">
            <CheckSquare size={16} className="text-yellow-400 mb-1" />
            <p className="text-lg font-bold text-foreground">{completedTodos}/{totalTodos}</p>
            <p className="text-[10px] text-muted-foreground text-center">{t('tasks_done')}</p>
            <p className="text-[10px] text-muted-foreground">{totalTodos > 0 ? Math.round(completedTodos / totalTodos * 100) : 0}%</p>
          </div>
        </div>

        {/* Chart */}
        {chartData.some(d => d.vércukor || d.kalória) && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-sm font-semibold text-foreground mb-3">{t('weekly_trend')}</p>
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="bsG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(0 84% 60%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(0 84% 60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="nap" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} cursor={false} />
                <Area type="monotone" dataKey="vércukor" stroke="hsl(0 84% 60%)" fill="url(#bsG)" strokeWidth={2} connectNulls name="vércukor" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-xs text-muted-foreground">{lang === 'hu' ? 'Vércukor (mmol/L)' : 'Blood sugar (mmol/L)'}</span>
            </div>
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={generateReport}
          disabled={loading || !dataLoaded}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold text-sm disabled:opacity-60"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {loading ? t('ai_analyzing') : t('generate_report')}
        </button>

        {/* AI Report */}
        <AnimatePresence>
          {report && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              {/* Evaluation */}
              <div className="bg-card border border-primary/30 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={15} className="text-primary" />
                  <p className="text-sm font-semibold text-foreground">{t('weekly_eval')}</p>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{report}</p>
              </div>

              {/* Tips */}
              {tips.length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-4">
                  <p className="text-sm font-semibold text-foreground mb-3">{t('tips_next_week')}</p>
                  <div className="space-y-3">
                    {tips.map((tip, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-xs font-bold text-primary">{i + 1}</span>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed">{tip}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Regenerate */}
              <button onClick={generateReport} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-secondary text-muted-foreground text-sm">
                <RefreshCw size={14} /> {t('regenerate')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {!report && !loading && dataLoaded && bloodSugars.length === 0 && meals.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <FileBarChart size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t('no_data_yet')}</p>
            <p className="text-xs mt-1">{t('no_data_hint')}</p>
          </div>
        )}
      </div>
    </div>
  );
}