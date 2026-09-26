import { useState, useEffect } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { listEntity } from '@/lib/apiThrottler';
import { Brain, CheckSquare, TrendingUp, Activity, Droplets, Pill, UtensilsCrossed, Settings2, Eye, EyeOff, GripVertical, Check } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, AreaChart, Area } from 'recharts';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '@/lib/i18n';
import SensitiveValue from '@/components/common/SensitiveValue';
import { maskCurrency, maskBloodSugar } from '@/lib/dataMasker';

const SkeletonBar = () => (
  <div className="h-24 bg-gradient-to-r from-secondary via-secondary to-secondary bg-[length:200%_100%] animate-pulse rounded-xl" />
);

const SkeletonStat = () => (
  <div className="bg-card rounded-2xl p-4 border border-border">
    <div className="w-9 h-9 rounded-xl bg-secondary animate-pulse mb-3" />
    <div className="h-7 w-16 bg-secondary animate-pulse rounded mb-1" />
    <div className="h-3 w-24 bg-secondary/50 animate-pulse rounded" />
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>
        ))}
      </div>
    );
  }
  return null;
};

const STORAGE_KEY = 'muszerfal_widgets_v2';

function loadWidgets(defaultWidgets) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return defaultWidgets;
}

function saveWidgets(widgets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
}

export default function Muszerfal() {
  const { t } = useLang();

  const DEFAULT_WIDGETS = [
    { id: 'stats', label: t('stat_tasks'), visible: true },
    { id: 'finance', label: t('finance_weekly'), visible: true },
    { id: 'bloodsugar', label: t('blood_sugar_trend'), visible: true },
    { id: 'health', label: t('today_calories'), visible: true },
    { id: 'memories', label: t('recent_memories'), visible: true },
    { id: 'todos', label: t('open_tasks_widget'), visible: true },
  ];

  const [memories, setMemories] = useState([]);
  const [todos, setTodos] = useState([]);
  const [finances, setFinances] = useState([]);
  const [bloodSugars, setBloodSugars] = useState([]);
  const [meals, setMeals] = useState([]);
  const [medications, setMedications] = useState([]);
  const [widgets, setWidgets] = useState(() => loadWidgets(DEFAULT_WIDGETS));
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const [mem, tod, fin, bs, ml, med] = await Promise.all([
        listEntity(jarvis.entities.Memory, '-created_date', 5, 'muszerfal_mem', 'anon', { userOwned: true, entityName: 'Memory' }),
        listEntity(jarvis.entities.TodoItem, '-created_date', 20, 'muszerfal_todo', 'anon', { userOwned: true, entityName: 'TodoItem' }),
        listEntity(jarvis.entities.FinanceEntry, '-date', 50, 'muszerfal_fin', 'anon', { userOwned: true, entityName: 'FinanceEntry' }),
        listEntity(jarvis.entities.BloodSugar, '-date', 14, 'muszerfal_bs', 'anon', { userOwned: true, entityName: 'BloodSugar' }),
        listEntity(jarvis.entities.MealLog, '-date', 7, 'muszerfal_meal', 'anon', { userOwned: true, entityName: 'MealLog' }),
        listEntity(jarvis.entities.Medication, '', 100, 'muszerfal_med', 'anon', { userOwned: true, entityName: 'Medication' }),
      ]);
      if (mem) setMemories(mem);
      if (tod) setTodos(tod);
      if (fin) setFinances(fin);
      if (bs) setBloodSugars(bs);
      if (ml) setMeals(ml);
      if (med) setMedications(med);
      setLoading(false);
    };
    loadData();
  }, []);

  const completedTodos = todos.filter(t => t.is_completed).length;
  const activeMeds = medications.filter(m => m.is_active).length;
  const todayStr = new Date().toISOString().split('T')[0];
  const todayCalories = meals.filter(m => m.date === todayStr).reduce((s, m) => s + (m.calories || 0), 0);
  const totalIncome = finances.filter(f => f.type === 'income').reduce((s, f) => s + (f.amount || 0), 0);
  const totalExpense = finances.filter(f => f.type === 'expense').reduce((s, f) => s + (f.amount || 0), 0);

  const financeChartData = (() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const dayName = ['V','H','K','Sz','Cs','P','Szo'][d.getDay()];
      const dayFinances = finances.filter(f => f.date === key);
      days.push({
        nap: dayName,
        [t('income_label')]: dayFinances.filter(f => f.type === 'income').reduce((s, f) => s + (f.amount || 0), 0),
        [t('expense_label')]: dayFinances.filter(f => f.type === 'expense').reduce((s, f) => s + (f.amount || 0), 0),
      });
    }
    return days;
  })();

  const bsChartData = bloodSugars.slice(0, 7).reverse().map((bs, i) => ({ idx: i + 1, value: bs.value }));

  const stats = [
    { label: t('stat_memory'), value: memories.length.toString(), icon: Brain, color: 'text-purple-400', bg: 'bg-purple-400/10' },
    { label: t('stat_tasks'), value: `${completedTodos}/${todos.length}`, icon: CheckSquare, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
    { label: t('stat_balance'), value: `£${(totalIncome - totalExpense).toFixed(0)}`, maskedValue: maskCurrency(totalIncome - totalExpense), icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
    { label: t('stat_meds'), value: `${activeMeds} ${t('stat_active')}`, icon: Pill, color: 'text-pink-400', bg: 'bg-pink-400/10' },
  ];

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(widgets);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setWidgets(reordered);
    saveWidgets(reordered);
  };

  const toggleVisible = (id) => {
    const updated = widgets.map(w => w.id === id ? { ...w, visible: !w.visible } : w);
    setWidgets(updated);
    saveWidgets(updated);
  };

  const renderWidget = (id) => {
    switch (id) {
      case 'stats':
        if (loading) return <div className="grid grid-cols-2 gap-3">{[1,2,3,4].map(i => <SkeletonStat key={i} />)}</div>;
        return (
          <div className="grid grid-cols-2 gap-3">
            {stats.map(({ label, value, maskedValue, icon: Icon, color, bg }) => (
              <div key={label} className="bg-card rounded-2xl p-4 border border-border">
                <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
                  <Icon size={18} className={color} />
                </div>
                {maskedValue ? (
                  <SensitiveValue className="text-2xl font-bold text-foreground" maskedValue={maskedValue}>
                    {value}
                  </SensitiveValue>
                ) : (
                  <div className="text-2xl font-bold text-foreground">{value}</div>
                )}
                <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        );
      case 'finance':
        if (loading) return <div className="bg-card rounded-2xl p-4 border border-border"><SkeletonBar /></div>;
        return (
          <div className="bg-card rounded-2xl p-4 border border-border overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">{t('finance_weekly')}</h2>
              <span className="text-xs text-muted-foreground">£{(totalIncome - totalExpense).toFixed(2)}</span>
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={financeChartData} barSize={10} barGap={2}>
                <XAxis dataKey="nap" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} cursor={false} />
                <Bar dataKey={t('income_label')} fill="hsl(160 60% 45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey={t('expense_label')} fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-1">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-primary" /><span className="text-xs text-muted-foreground">{t('income_label')}</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-muted-foreground">{t('expense_label')}</span></div>
            </div>
          </div>
        );
      case 'bloodsugar':
        if (loading) return <div className="bg-card rounded-2xl p-4 border border-border"><SkeletonBar /></div>;
        return bsChartData.length > 0 ? (
          <div className="bg-card rounded-2xl p-4 border border-border overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Droplets size={15} className="text-red-400" />
                <h2 className="text-sm font-semibold text-foreground">{t('blood_sugar_trend')}</h2>
              </div>
              <span className="text-xs text-muted-foreground">{bloodSugars[0]?.value} mmol/L</span>
            </div>
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={bsChartData}>
                <defs>
                  <linearGradient id="bsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(0 84% 60%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(0 84% 60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="idx" hide />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip content={<CustomTooltip />} cursor={false} />
                <Area type="monotone" dataKey="value" stroke="hsl(0 84% 60%)" fill="url(#bsGrad)" strokeWidth={2} name="mmol/L" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : null;
      case 'health':
        return (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card rounded-2xl p-4 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <UtensilsCrossed size={14} className="text-green-400" />
                <span className="text-xs font-medium text-foreground">{t('today_calories')}</span>
              </div>
              <p className="text-2xl font-bold text-green-400">{todayCalories}</p>
              <p className="text-xs text-muted-foreground">kcal</p>
            </div>
            <div className="bg-card rounded-2xl p-4 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <Activity size={14} className="text-orange-400" />
                <span className="text-xs font-medium text-foreground">{t('open_tasks_label')}</span>
              </div>
              <p className="text-2xl font-bold text-orange-400">{todos.filter(td => !td.is_completed).length}</p>
              <p className="text-xs text-muted-foreground">{t('pending_label')}</p>
            </div>
          </div>
        );
      case 'memories':
        return memories.length > 0 ? (
          <div className="bg-card rounded-2xl p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Brain size={15} className="text-purple-400" />
              <h2 className="text-sm font-semibold text-foreground">{t('recent_memories')}</h2>
            </div>
            <div className="space-y-2">
              {memories.slice(0, 4).map((mem, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                  <p className="text-xs text-foreground leading-relaxed">{mem.content}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null;
      case 'todos':
        return todos.filter(td => !td.is_completed).length > 0 ? (
          <div className="bg-card rounded-2xl p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare size={15} className="text-yellow-400" />
              <h2 className="text-sm font-semibold text-foreground">{t('open_tasks_widget')}</h2>
            </div>
            <div className="space-y-2">
              {todos.filter(td => !td.is_completed).slice(0, 5).map((todo, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-border shrink-0" />
                  <p className="text-xs text-foreground">{todo.title}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 pt-5 pb-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center">
            <TrendingUp size={20} className="text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">{t('dashboard_title')}</h1>
            <p className="text-xs text-muted-foreground">{t('dashboard_sub')}</p>
          </div>
          <button
            onClick={() => setEditMode(e => !e)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${editMode ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
          >
            {editMode ? <><Check size={12} /> {t('done')}</> : <><Settings2 size={12} /> {t('customize')}</>}
          </button>
        </div>

        <AnimatePresence>
          {editMode && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="bg-card border border-primary/30 rounded-2xl p-4">
                <p className="text-xs font-semibold text-primary mb-1">👁️ {t('widget_visibility')}</p>
                <p className="text-xs text-muted-foreground mb-3">{t('widget_visibility_desc')}</p>
                <div className="space-y-2">
                  {widgets.map(w => (
                    <div key={w.id} className="flex items-center gap-3">
                      <button onClick={() => toggleVisible(w.id)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${w.visible ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                        {w.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <span className={`text-sm flex-1 ${w.visible ? 'text-foreground' : 'text-muted-foreground line-through'}`}>{w.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="widgets">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                {widgets.filter(w => w.visible).map((widget, index) => {
                  const content = renderWidget(widget.id);
                  if (!content && !editMode) return null;
                  return (
                    <Draggable key={widget.id} draggableId={widget.id} index={index} isDragDisabled={!editMode}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`transition-transform ${snapshot.isDragging ? 'scale-[1.02] shadow-2xl opacity-90' : ''}`}
                        >
                          {editMode ? (
                            <div className="relative">
                              <div {...provided.dragHandleProps} className="absolute left-2 top-2 z-10 cursor-grab active:cursor-grabbing bg-card/80 rounded-lg p-1 touch-none">
                                <GripVertical size={16} className="text-primary" />
                              </div>
                              <div className="pl-2 opacity-90">
                                {content || <div className="bg-card border border-dashed border-border rounded-2xl p-4 text-xs text-muted-foreground text-center">{widget.label} – {t('no_data')}</div>}
                              </div>
                            </div>
                          ) : content}
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>
    </div>
  );
}