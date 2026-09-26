/**
 * Eszkozok – Tools Hub (productized)
 * Primary tools first, advanced tools in "More tools" section.
 */
import { useState, useEffect } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { listEntity } from '@/lib/apiThrottler';
import { updateOwnedEntity, deleteOwnedEntity } from '@/lib/ownedEntityHelpers';
import {
  Navigation, ChevronDown, ChevronUp,
  Plus, Trash2, FileEdit, Pill, Droplets, UtensilsCrossed,
  Phone
} from 'lucide-react';
import RuleEngine from '@/components/rules/RuleEngine';
import GlucoSensorConnector from '@/components/glucose/GlucoSensorConnector';
import { useLang } from '@/lib/i18n';
import ToolsHubGrid from '@/components/tools/ToolsHubGrid';
import ToolsPageHeader from '@/components/tools/ToolsPageHeader';
import QuickActionButtons from '@/components/tools/QuickActionButtons';
import ToolsTodoPanel from '@/components/tools/ToolsTodoPanel';
import ToolsActionModal from '@/components/tools/ToolsActionModal';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import PullToRefresh from '@/components/common/PullToRefresh';
import MobileSelect from '@/components/common/MobileSelect';
import SensitiveValue from '@/components/common/SensitiveValue';
import { maskBloodSugar } from '@/lib/dataMasker';

const today = () => new Date().toISOString().split('T')[0];

async function getCurrentUserOrThrow() {
  const currentUser = await jarvis.auth.me().catch(() => null);
  if (!currentUser?.email) throw new Error('A művelethez be kell jelentkezned.');
  return currentUser;
}

function withOwner(data, currentUser) {
  return { ...data, created_by: currentUser.email };
}



export default function Eszkozok() {
  const { t } = useLang();
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState('');
  const [priority, setPriority] = useState('kozepes');
  const [sections, setSections] = useState({ notes: false, bloodsugar: false, meal: false, medication: false });
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [bloodSugars, setBloodSugars] = useState([]);
  const [newBs, setNewBs] = useState({ value: '', time_of_day: 'reggel', reading_time: '', date: today() });
  const [meals, setMeals] = useState([]);
  const [newMeal, setNewMeal] = useState({ meal_name: '', meal_type: 'reggeli', calories: '', date: today() });
  const [medications, setMedications] = useState([]);
  const [newMed, setNewMed] = useState({ name: '', dose: '', frequency: '', time: '' });
  const [showCallModal, setShowCallModal] = useState(false);
  const [showNavModal, setShowNavModal] = useState(false);
  const [navQuery, setNavQuery] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');


  useEffect(() => {
    const loadData = async () => {
      const [td, nt, bs, ml, md] = await Promise.all([
        listEntity(jarvis.entities.TodoItem, '-created_date', 100, 'eszkozok_todos', undefined, { userOwned: true, entityName: 'TodoItem' }),
        listEntity(jarvis.entities.Note, '-created_date', 100, 'eszkozok_notes', undefined, { userOwned: true, entityName: 'Note' }),
        listEntity(jarvis.entities.BloodSugar, '-date', 100, 'eszkozok_bloodsugar', undefined, { userOwned: true, entityName: 'BloodSugar' }),
        listEntity(jarvis.entities.MealLog, '-date', 100, 'eszkozok_meals', undefined, { userOwned: true, entityName: 'MealLog' }),
        listEntity(jarvis.entities.Medication, '', 100, 'eszkozok_meds', undefined, { userOwned: true, entityName: 'Medication' }),
      ]);
      if (td) setTodos(td);
      if (nt) setNotes(nt);
      if (bs) setBloodSugars(bs);
      if (ml) setMeals(ml);
      if (md) setMedications(md);
    };
    loadData();
  }, []);

  const toggleSection = (key) => setSections(s => ({ ...s, [key]: !s[key] }));

  const addTodo = async () => {
    if (!newTodo.trim()) return;
    const currentUser = await getCurrentUserOrThrow();
    const optimistic = { id: `tmp_${Date.now()}`, title: newTodo, priority, is_completed: false, created_by: currentUser.email };
    setTodos(prev => [optimistic, ...prev]);
    setNewTodo('');
    const created = await jarvis.entities.TodoItem.create(withOwner({ title: optimistic.title, priority, is_completed: false }, currentUser));
    setTodos(prev => prev.map(t => t.id === optimistic.id ? created : t));
  };

  const toggleTodo = async (todo) => {
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, is_completed: !t.is_completed } : t));
    await updateOwnedEntity(jarvis.entities.TodoItem, todo.id, { is_completed: !todo.is_completed });
  };

  const deleteTodo = async (id) => {
    setTodos(prev => prev.filter(t => t.id !== id));
    await deleteOwnedEntity(jarvis.entities.TodoItem, id);
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    const currentUser = await getCurrentUserOrThrow();
    const optimistic = { id: `tmp_${Date.now()}`, title: newNote, content: '', created_by: currentUser.email };
    setNotes(prev => [optimistic, ...prev]);
    setNewNote('');
    const created = await jarvis.entities.Note.create(withOwner({ title: optimistic.title, content: '' }, currentUser));
    setNotes(prev => prev.map(n => n.id === optimistic.id ? created : n));
  };

  const deleteNote = async (id) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    await deleteOwnedEntity(jarvis.entities.Note, id);
  };

  const addBloodSugar = async () => {
    if (!newBs.value) return;
    const currentUser = await getCurrentUserOrThrow();
    const data = withOwner({ ...newBs, value: parseFloat(newBs.value) }, currentUser);
    const optimistic = { id: `tmp_${Date.now()}`, ...data };
    setBloodSugars(prev => [optimistic, ...prev]);
    setNewBs({ value: '', time_of_day: 'reggel', reading_time: '', date: today() });
    const created = await jarvis.entities.BloodSugar.create(data);
    setBloodSugars(prev => prev.map(b => b.id === optimistic.id ? created : b));
  };

  const addMeal = async () => {
    if (!newMeal.meal_name.trim()) return;
    const currentUser = await getCurrentUserOrThrow();
    const data = withOwner({ ...newMeal, calories: parseFloat(newMeal.calories) || 0 }, currentUser);
    const optimistic = { id: `tmp_${Date.now()}`, ...data };
    setMeals(prev => [optimistic, ...prev]);
    setNewMeal({ meal_name: '', meal_type: 'reggeli', calories: '', date: today() });
    const created = await jarvis.entities.MealLog.create(data);
    setMeals(prev => prev.map(m => m.id === optimistic.id ? created : m));
  };

  const addMedication = async () => {
    if (!newMed.name.trim()) return;
    const currentUser = await getCurrentUserOrThrow();
    const data = withOwner({ ...newMed, times: newMed.time ? [newMed.time] : [], is_active: true }, currentUser);
    const optimistic = { id: `tmp_${Date.now()}`, ...data };
    setMedications(prev => [optimistic, ...prev]);
    setNewMed({ name: '', dose: '', frequency: '', time: '' });
    const created = await jarvis.entities.Medication.create(data);
    setMedications(prev => prev.map(m => m.id === optimistic.id ? created : m));
  };

  const toggleMed = async (med) => {
    setMedications(prev => prev.map(m => m.id === med.id ? { ...m, is_active: !m.is_active } : m));
    await updateOwnedEntity(jarvis.entities.Medication, med.id, { is_active: !med.is_active });
  };

  const refreshAll = async () => {
    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email) return;
    const userFilter = { created_by: currentUser.email };
    const [t, n, bs, m, meds] = await Promise.all([
      jarvis.entities.TodoItem.filter(userFilter, '-created_date', 100),
      jarvis.entities.Note.filter(userFilter, '-created_date', 100),
      jarvis.entities.BloodSugar.filter(userFilter, '-date', 100),
      jarvis.entities.MealLog.filter(userFilter, '-date', 100),
      jarvis.entities.Medication.filter(userFilter, '', 100),
    ]);
    setTodos(t || []); setNotes(n || []); setBloodSugars(bs || []);
    setMeals(m || []); setMedications(meds || []);
  };

  const openGoogleMaps = () => {
    const query = encodeURIComponent(navQuery || 'London');
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}`, '_blank');
    setShowNavModal(false);
    setNavQuery('');
  };

  const pendingTodos = todos.filter(t => !t.is_completed).length;
  const activeMeds = medications.filter(m => m.is_active).length;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <PullToRefresh onRefresh={refreshAll}>
        <div className="px-4 pt-5 pb-6 space-y-4">

          <ToolsPageHeader title={t('tools')} pendingTodos={pendingTodos} activeMeds={activeMeds} t={t} />

          <QuickActionButtons onCall={() => setShowCallModal(true)} onNavigate={() => setShowNavModal(true)} t={t} />

          <ToolsTodoPanel
            todos={todos}
            newTodo={newTodo}
            priority={priority}
            setNewTodo={setNewTodo}
            setPriority={setPriority}
            onAdd={addTodo}
            onToggle={toggleTodo}
            onDelete={deleteTodo}
            t={t}
          />

          <ToolsHubGrid />


          {/* Notes */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <button onClick={() => toggleSection('notes')} className="w-full flex items-center gap-3 p-4">
              <FileEdit size={18} className="text-purple-400" />
              <span className="flex-1 text-sm font-medium text-foreground text-left">{t('notes')}</span>
              <span className="text-xs text-muted-foreground mr-2">{notes.length}</span>
              {sections.notes ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            <AnimatePresence>
              {sections.notes && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t border-border">
                  <div className="p-4 space-y-2">
                    <div className="flex gap-2">
                      <input className="flex-1 bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground" placeholder={t('new_note')} value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()} />
                      <button onClick={addNote} className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center"><Plus size={16} className="text-primary-foreground" /></button>
                    </div>
                    {notes.map(note => (
                      <div key={note.id} className="flex items-center gap-2 bg-secondary rounded-xl p-3">
                        <p className="flex-1 text-sm text-foreground">{note.title}</p>
                        <button onClick={() => deleteNote(note.id)} className="text-muted-foreground/50 hover:text-destructive"><Trash2 size={14} /></button>
                      </div>
                    ))}
                    {notes.length === 0 && <p className="text-xs text-muted-foreground text-center">{t('no_notes')}</p>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Glucose Sensor */}
          <GlucoSensorConnector />

          {/* Blood Sugar */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <button onClick={() => toggleSection('bloodsugar')} className="w-full flex items-center gap-3 p-4">
              <Droplets size={18} className="text-red-400" />
              <span className="flex-1 text-sm font-medium text-foreground text-left">{t('blood_sugar_log')}</span>
              <span className="text-xs text-muted-foreground mr-2">{bloodSugars.filter(b => b.date === today()).length} {t('today')}</span>
              {sections.bloodsugar ? <ChevronUp size={16} /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            <AnimatePresence>
              {sections.bloodsugar && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t border-border">
                  <div className="p-4 space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <input className="bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground" type="number" step="0.1" placeholder={t('value')} value={newBs.value} onChange={e => setNewBs(b => ({...b, value: e.target.value}))} />
                      <MobileSelect className="sm:col-span-2" value={newBs.time_of_day} onChange={v => setNewBs(b => ({...b, time_of_day: v}))} options={['reggel','ebéd előtt','ebéd után','vacsora előtt','vacsora után','lefekvés előtt'].map(t => ({ value: t, label: t }))} placeholder={t('time_of_day')} />
                    </div>
                    <input className="w-full bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground" type="time" value={newBs.reading_time || ''} onChange={e => setNewBs(b => ({...b, reading_time: e.target.value}))} />
                    <button onClick={addBloodSugar} className="w-full py-2 rounded-xl bg-red-500/20 text-red-400 text-sm font-medium border border-red-500/30">+ {t('log_reading')}</button>
                    <div className="space-y-1">
                      {bloodSugars.slice(0,5).map(bs => (
                        <div key={bs.id} className="flex items-center justify-between bg-secondary rounded-xl px-3 py-2">
                          <SensitiveValue className="text-sm text-foreground" maskedValue={maskBloodSugar(bs.value)}>
                            {bs.value} mmol/L
                          </SensitiveValue>
                          <span className="text-xs text-muted-foreground">{bs.reading_time ? `${bs.reading_time} · ` : ''}{bs.time_of_day} · {bs.date}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Meal Log */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <button onClick={() => toggleSection('meal')} className="w-full flex items-center gap-3 p-4">
              <UtensilsCrossed size={18} className="text-green-400" />
              <span className="flex-1 text-sm font-medium text-foreground text-left">{t('meal_log')}</span>
              <span className="text-xs text-muted-foreground mr-2">{meals.filter(m => m.date === today()).length} {t('today')}</span>
              {sections.meal ? <ChevronUp size={16} /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            <AnimatePresence>
              {sections.meal && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t border-border">
                  <div className="p-4 space-y-2">
                    <input className="w-full bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground" placeholder={t('meal_name')} value={newMeal.meal_name} onChange={e => setNewMeal(m => ({...m, meal_name: e.target.value}))} />
                    <div className="grid grid-cols-2 gap-2">
                      <MobileSelect value={newMeal.meal_type} onChange={v => setNewMeal(m => ({...m, meal_type: v}))} options={['reggeli','tízórai','ebéd','uzsonna','vacsora'].map(t => ({ value: t, label: t }))} placeholder={t('meal_log')} />
                      <input className="bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground" type="number" placeholder={t('calories')} value={newMeal.calories} onChange={e => setNewMeal(m => ({...m, calories: e.target.value}))} />
                    </div>
                    <button onClick={addMeal} className="w-full py-2 rounded-xl bg-green-500/20 text-green-400 text-sm font-medium border border-green-500/30">+ {t('add_meal')}</button>
                    {meals.slice(0,5).map(meal => (
                      <div key={meal.id} className="flex items-center justify-between bg-secondary rounded-xl px-3 py-2">
                        <div>
                          <p className="text-sm text-foreground">{meal.meal_name}</p>
                          <p className="text-xs text-muted-foreground">{meal.meal_type}</p>
                        </div>
                        {meal.calories > 0 && <span className="text-xs text-muted-foreground">{meal.calories} kcal</span>}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <RuleEngine />

          {/* Medication */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <button onClick={() => toggleSection('medication')} className="w-full flex items-center gap-3 p-4">
              <Pill size={18} className="text-pink-400" />
              <span className="flex-1 text-sm font-medium text-foreground text-left">{t('medication')}</span>
              <span className="text-xs text-muted-foreground mr-2">{activeMeds} {t('active')}</span>
              {sections.medication ? <ChevronUp size={16} /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            <AnimatePresence>
              {sections.medication && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t border-border">
                  <div className="p-4 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input className="bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground" placeholder={t('name')} value={newMed.name} onChange={e => setNewMed(m => ({...m, name: e.target.value}))} />
                      <input className="bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground" placeholder={t('dose')} value={newMed.dose} onChange={e => setNewMed(m => ({...m, dose: e.target.value}))} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground" placeholder={t('frequency')} value={newMed.frequency} onChange={e => setNewMed(m => ({...m, frequency: e.target.value}))} />
                      <input type="time" className="bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground" value={newMed.time || ''} onChange={e => setNewMed(m => ({...m, time: e.target.value}))} />
                    </div>
                    <button onClick={addMedication} className="w-full py-2 rounded-xl bg-pink-500/20 text-pink-400 text-sm font-medium border border-pink-500/30">+ {t('add_medication')}</button>
                    {medications.map(med => (
                      <div key={med.id} className="flex items-center gap-3 bg-secondary rounded-xl px-3 py-2">
                        <button onClick={() => toggleMed(med)} className={`w-5 h-5 rounded-full border-2 shrink-0 ${med.is_active ? 'bg-primary border-primary' : 'border-border'}`} />
                        <div className="flex-1">
                          <p className="text-sm text-foreground">{med.name}</p>
                          {med.dose && <p className="text-xs text-muted-foreground">{med.dose} · {med.frequency} {med.time && `· ${med.time}`}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </PullToRefresh>

      <ToolsActionModal show={showCallModal} title={`📞 ${t('make_call')}`} onClose={() => setShowCallModal(false)}>
        <input className="w-full bg-secondary rounded-xl px-4 py-3 text-lg outline-none border border-border text-foreground tracking-widest mb-4" placeholder="+44 XX XXXX XXXX" type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} />
        <a href={`tel:${phoneNumber.replace(/\s/g,'')}`} onClick={() => setShowCallModal(false)} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-500 text-white font-semibold text-base">
          <Phone size={18} /> {t('call')}
        </a>
      </ToolsActionModal>

      <ToolsActionModal show={showNavModal} title={`🗺️ ${t('navigation')}`} onClose={() => setShowNavModal(false)}>
        <input className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none border border-border text-foreground mb-4" placeholder={t('navigate_where_full')} value={navQuery} onChange={e => setNavQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && openGoogleMaps()} />
        <button onClick={openGoogleMaps} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-500 text-white font-semibold text-sm">
          <Navigation size={16} /> {t('open_maps')}
        </button>
      </ToolsActionModal>
    </div>
  );
}