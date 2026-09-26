import { useState, useEffect } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { Bell, Plus, Check, Trash2, X, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@/lib/i18n';
import TutorialOverlay from '@/components/tutorial/TutorialOverlay';
import PullToRefresh from '@/components/common/PullToRefresh';
import MobileSelect from '@/components/common/MobileSelect';

const ConfirmDialog = ({ title, message, onConfirm, onCancel, isOpen }) => {
  if (!isOpen) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card rounded-2xl p-6 max-w-xs mx-auto border border-border">
        <h2 className="text-sm font-semibold text-foreground mb-2">{title}</h2>
        <p className="text-xs text-muted-foreground mb-4">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl bg-secondary text-xs font-medium text-foreground">Mégse</button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded-xl bg-red-500/20 text-red-400 text-xs font-medium border border-red-500/30">Törlés</button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const TX = {
  title:    { hu:'Emlékeztetők', en:'Reminders', de:'Erinnerungen', fr:'Rappels', es:'Recordatorios' },
  new:      { hu:'Új emlékeztető', en:'New reminder', de:'Neue Erinnerung', fr:'Nouveau rappel', es:'Nuevo recordatorio' },
  active:   { hu:'Aktív', en:'Active', de:'Aktiv', fr:'Actif', es:'Activo' },
  done:     { hu:'Teljesítve', en:'Completed', de:'Erledigt', fr:'Terminé', es:'Completado' },
  empty:    { hu:'Nincsenek emlékeztetők', en:'No reminders', de:'Keine Erinnerungen', fr:'Aucun rappel', es:'Sin recordatorios' },
  title_f:  { hu:'Cím *', en:'Title *', de:'Titel *', fr:'Titre *', es:'Título *' },
  desc:     { hu:'Leírás', en:'Description', de:'Beschreibung', fr:'Description', es:'Descripción' },
  save:     { hu:'Mentés', en:'Save', de:'Speichern', fr:'Enregistrer', es:'Guardar' },
  close:    { hu:'Bezárás', en:'Close', de:'Schließen', fr:'Fermer', es:'Cerrar' },
  n_active: { hu:'aktív', en:'active', de:'aktiv', fr:'actif', es:'activo' },
};
const tx = (lang, key) => TX[key]?.[lang] || TX[key]?.en || key;

const categoryColors = {
  health: 'text-red-400 bg-red-500/10',
  finance: 'text-green-400 bg-green-500/10',
  work: 'text-blue-400 bg-blue-500/10',
  personal: 'text-purple-400 bg-purple-500/10',
  other: 'text-muted-foreground bg-secondary',
};

export default function Reminders() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const T = (k) => tx(lang, k);
  const [reminders, setReminders] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', due_date: '', due_time: '', category: 'other' });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null });

  useEffect(() => {
    jarvis.auth.me()
      .then((user) => {
        if (!user?.email) throw new Error('auth_required');
        return jarvis.entities.Reminder.filter({ created_by: user.email }, '-due_date');
      })
      .then(setReminders)
      .catch(() => {});
  }, []);

  const addReminder = async () => {
    if (!form.title.trim()) return;
    const currentUser = await jarvis.auth.me();
    if (!currentUser?.email) return;
    const created = await jarvis.entities.Reminder.create({ ...form, is_done: false, created_by: currentUser.email });
    setReminders(prev => [created, ...prev]);
    setForm({ title: '', description: '', due_date: '', due_time: '', category: 'other' });
    setShowAdd(false);
  };

  const toggleDone = async (r) => {
    await jarvis.entities.Reminder.update(r.id, { is_done: !r.is_done });
    setReminders(prev => prev.map(rem => rem.id === r.id ? { ...rem, is_done: !rem.is_done } : rem));
  };

  const deleteReminder = async (id) => {
    await jarvis.entities.Reminder.delete(id);
    setReminders(prev => prev.filter(r => r.id !== id));
    setConfirmDelete({ isOpen: false, id: null });
  };

  const handleDeleteClick = (id) => {
    setConfirmDelete({ isOpen: true, id });
  };

  const pending = reminders.filter(r => !r.is_done);
  const done = reminders.filter(r => r.is_done);

  const remindersTutorial = [
    {
      icon: '🔔',
      title: 'Emlékeztetők kezelése',
      description: 'Hozz létre időzített emlékeztetőket összes fontos feladathoz.',
      hint: 'Választhatsz kategóriákat és időpontokat',
    },
    {
      icon: '✓',
      title: 'Feladatok nyomon követése',
      description: 'Jelöld meg a feladatokat teljesítettként, vagy húzd a kész listára.',
      hint: 'A teljesített emlékeztetők halványabbak lesznek',
    },
    {
      icon: '📅',
      title: 'Kezdj el!',
      description: 'Add hozzá az első emlékeztetődet a "Új emlékeztető" gombbal.',
      hint: 'Időponttal és kategóriával részletesebb lehet',
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-background">
      <TutorialOverlay tutorialId="reminders-intro" steps={remindersTutorial} />
      <PullToRefresh onRefresh={async () => {
        const user = await jarvis.auth.me().catch(() => null);
        if (!user?.email) return;
        const refreshed = await jarvis.entities.Reminder.filter({ created_by: user.email }, '-due_date');
        setReminders(refreshed);
      }}>
      <div className="px-4 pt-5 pb-6">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <ArrowLeft size={16} className="text-muted-foreground" />
          </button>
          <div className="w-9 h-9 rounded-2xl bg-yellow-500/20 flex items-center justify-center">
            <Bell size={18} className="text-yellow-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{T('title')}</h1>
            <p className="text-xs text-muted-foreground">{pending.length} {T('n_active')}</p>
          </div>
        </div>

        <button onClick={() => setShowAdd(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm mb-5">
          <Plus size={15} /> {T('new')}
        </button>

        {pending.length > 0 && (
          <div className="mb-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">{T('active')}</p>
            <div className="space-y-2">
              {pending.map(r => (
                <div key={r.id} className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
                  <button onClick={() => toggleDone(r)} className="w-6 h-6 rounded-full border-2 border-primary flex items-center justify-center shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-transparent" />
                  </button>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{r.title}</p>
                    {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      {r.category && (
                        <span className={`px-2 py-0.5 rounded-full text-xs ${categoryColors[r.category]}`}>{r.category}</span>
                      )}
                      {r.due_date && <span className="text-xs text-muted-foreground">📅 {r.due_date} {r.due_time || ''}</span>}
                    </div>
                  </div>
                  <button onClick={() => handleDeleteClick(r.id)} className="text-muted-foreground/40 hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {done.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">{T('done')}</p>
            <div className="space-y-2">
              {done.slice(0, 5).map(r => (
                <div key={r.id} className="bg-card/50 border border-border/50 rounded-2xl p-3 flex items-center gap-3 opacity-60">
                  <button onClick={() => toggleDone(r)} className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Check size={12} className="text-primary-foreground" />
                  </button>
                  <p className="text-sm text-muted-foreground line-through flex-1">{r.title}</p>
                  <button onClick={() => handleDeleteClick(r.id)} className="text-muted-foreground/30 hover:text-red-400">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {reminders.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Bell size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{T('empty')}</p>
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
                <h2 className="text-base font-semibold text-foreground">{T('new')}</h2>
                <button onClick={() => setShowAdd(false)}><X size={18} className="text-muted-foreground" /></button>
              </div>
              <div className="space-y-3">
                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
                  placeholder={T('title_f')} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
                  placeholder={T('desc')} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" className="bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground"
                    value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                  <input type="time" className="bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground"
                    value={form.due_time} onChange={e => setForm(f => ({ ...f, due_time: e.target.value }))} />
                </div>
                <MobileSelect
                  value={form.category}
                  onChange={value => setForm(f => ({ ...f, category: value }))}
                  options={['health', 'finance', 'work', 'personal', 'other'].map(c => ({ value: c, label: c }))}
                  placeholder={lang === 'hu' ? 'Kategória' : 'Category'}
                />
                <button onClick={addReminder} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold">{T('save')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Emlékeztető törlése"
        message="Biztosan törölni szeretnéd ezt az emlékeztetőt?"
        onConfirm={() => deleteReminder(confirmDelete.id)}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null })}
      />
    </div>
  );
}