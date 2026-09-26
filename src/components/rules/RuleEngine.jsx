import { useState, useEffect } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { executeRuleAction } from '@/lib/ruleEngine';
import { Plus, Trash2, Play, Zap, ToggleLeft, ToggleRight, ChevronDown, ChevronUp } from 'lucide-react';
import MobileSelect from '@/components/common/MobileSelect';
import { motion, AnimatePresence } from 'framer-motion';

const TRIGGER_LABELS = {
  geofence_leave: '📍 Elhagyja a helyszínt',
  geofence_enter: '📍 Belép a helyszínre',
  time: '⏰ Időpont alapján',
  manual: '👆 Kézi indítás',
};

const ACTION_LABELS = {
  device_on: '💡 Eszköz BE',
  device_off: '🔌 Eszköz KI',
  trigger_scene: '🎬 Jelenet indítása',
  run_routine: '🔄 Rutin futtatása',
};

const EMPTY_FORM = {
  name: '',
  trigger_type: 'geofence_leave',
  trigger_location_id: '',
  trigger_time: '',
  action_type: 'device_off',
  action_target: '',
  is_active: true,
};

export default function RuleEngine() {
  const [rules, setRules] = useState([]);
  const [locations, setLocations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState(null);
  const [runResult, setRunResult] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    jarvis.auth.me()
      .then((currentUser) => {
        if (!currentUser?.email) throw new Error('auth_required');
        return Promise.all([
          jarvis.entities.AutomationRule.filter({ created_by: currentUser.email }, '-created_date'),
          jarvis.entities.SavedLocation.filter({ created_by: currentUser.email }),
        ]);
      })
      .then(([ruleRows, locationRows]) => {
        setRules(ruleRows);
        setLocations(locationRows);
      })
      .catch(() => {
        setRules([]);
        setLocations([]);
      });
  }, []);

  const saveRule = async () => {
    if (!form.name.trim() || !form.action_target.trim()) return;
    setSaving(true);
    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email) return;
    const created = await jarvis.entities.AutomationRule.create({ ...form, created_by: currentUser.email });
    setRules(prev => [created, ...prev]);
    setForm(EMPTY_FORM);
    setShowForm(false);
    setSaving(false);
  };

  const deleteRule = async (id) => {
    const currentUser = await jarvis.auth.me().catch(() => null);
    const rule = rules.find((item) => item.id === id);
    if (!currentUser?.email || rule?.created_by !== currentUser.email) return;
    await jarvis.entities.AutomationRule.delete(id);
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const toggleActive = async (rule) => {
    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email || rule.created_by !== currentUser.email) return;
    await jarvis.entities.AutomationRule.update(rule.id, { is_active: !rule.is_active });
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
  };

  const runManually = async (rule) => {
    setRunningId(rule.id);
    setRunResult('');
    const result = await executeRuleAction(rule);
    setRunResult(`${rule.name}: ${result.message}`);
    setRunningId(null);
    // Update stats
    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email || rule.created_by !== currentUser.email) return;
    jarvis.entities.AutomationRule.update(rule.id, {
      last_triggered: new Date().toISOString(),
      trigger_count: (rule.trigger_count || 0) + 1,
    }).catch(() => {});
    setRules(prev => prev.map(r => r.id === rule.id
      ? { ...r, last_triggered: new Date().toISOString(), trigger_count: (r.trigger_count || 0) + 1 }
      : r
    ));
    setTimeout(() => setRunResult(''), 5000);
  };

  const needsLocation = form.trigger_type === 'geofence_leave' || form.trigger_type === 'geofence_enter';

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden mb-3">
      {/* Header toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 p-4"
      >
        <Zap size={18} className="text-yellow-400 shrink-0" />
        <div className="flex-1 text-left">
          <p className="text-sm font-medium text-foreground">Szabály Motor</p>
          <p className="text-xs text-muted-foreground">{rules.filter(r => r.is_active).length} aktív szabály</p>
        </div>
        {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="p-4 space-y-3">

              {/* Run result */}
              <AnimatePresence>
                {runResult && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="bg-primary/10 border border-primary/30 rounded-xl px-3 py-2 text-xs text-primary"
                  >
                    {runResult}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Rules list */}
              {rules.length === 0 && !showForm && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Még nincsenek szabályok. Hozz létre egyet!
                </p>
              )}

              {rules.map(rule => (
                <div key={rule.id} className={`border rounded-xl p-3 ${rule.is_active ? 'border-border' : 'border-border/40 opacity-60'}`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{rule.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {TRIGGER_LABELS[rule.trigger_type]}
                        {rule.trigger_location_id && locations.find(l => l.id === rule.trigger_location_id)
                          ? ` · ${locations.find(l => l.id === rule.trigger_location_id).name}`
                          : ''}
                        {rule.trigger_time ? ` · ${rule.trigger_time}` : ''}
                      </p>
                      <p className="text-xs text-primary mt-0.5">
                        → {ACTION_LABELS[rule.action_type]}: <span className="font-medium">{rule.action_target}</span>
                      </p>
                      {rule.last_triggered && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Utoljára: {new Date(rule.last_triggered).toLocaleString('hu-HU')} · {rule.trigger_count}×
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Toggle active */}
                      <button onClick={() => toggleActive(rule)}>
                        {rule.is_active
                          ? <ToggleRight size={20} className="text-primary" />
                          : <ToggleLeft size={20} className="text-muted-foreground" />
                        }
                      </button>
                      {/* Run manually */}
                      <button
                        onClick={() => runManually(rule)}
                        disabled={runningId === rule.id}
                        className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center hover:bg-primary/20 transition-colors"
                      >
                        <Play size={12} className={runningId === rule.id ? 'text-primary animate-pulse' : 'text-muted-foreground'} />
                      </button>
                      {/* Delete */}
                      <button onClick={() => deleteRule(rule.id)} className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center hover:bg-red-500/20 transition-colors">
                        <Trash2 size={12} className="text-muted-foreground hover:text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add rule form */}
              <AnimatePresence>
                {showForm && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="bg-secondary border border-border rounded-xl p-3 space-y-2"
                  >
                    <p className="text-xs font-semibold text-foreground">Új szabály</p>

                    <input
                      className="w-full bg-card rounded-lg px-3 py-2 text-sm outline-none border border-border text-foreground"
                      placeholder="Szabály neve (pl. Hazamegyek → Lámpák KI)"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">HA (trigger)</p>
                        <MobileSelect
                          value={form.trigger_type}
                          onChange={v => setForm(f => ({ ...f, trigger_type: v }))}
                          options={Object.entries(TRIGGER_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                          placeholder="Trigger típusa"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">AKKOR (action)</p>
                        <MobileSelect
                          value={form.action_type}
                          onChange={v => setForm(f => ({ ...f, action_type: v }))}
                          options={Object.entries(ACTION_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                          placeholder="Akció típusa"
                        />
                      </div>
                    </div>

                    {/* Geofence location picker */}
                    {needsLocation && (
                      <MobileSelect
                        value={form.trigger_location_id}
                        onChange={v => setForm(f => ({ ...f, trigger_location_id: v }))}
                        options={[{ value: '', label: '-- Helyszín kiválasztása --' }, ...locations.map(l => ({ value: l.id, label: l.name }))]}
                        placeholder="Helyszín kiválasztása"
                      />
                    )}

                    {/* Time trigger */}
                    {form.trigger_type === 'time' && (
                      <input
                        type="time"
                        className="w-full bg-card rounded-lg px-3 py-2 text-sm outline-none border border-border text-foreground"
                        value={form.trigger_time}
                        onChange={e => setForm(f => ({ ...f, trigger_time: e.target.value }))}
                      />
                    )}

                    <input
                      className="w-full bg-card rounded-lg px-3 py-2 text-sm outline-none border border-border text-foreground"
                      placeholder="Cél neve (pl. Nappali lámpa, Esti mód)"
                      value={form.action_target}
                      onChange={e => setForm(f => ({ ...f, action_target: e.target.value }))}
                    />

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={saveRule}
                        disabled={saving}
                        className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
                      >
                        {saving ? 'Mentés...' : 'Mentés'}
                      </button>
                      <button
                        onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                        className="px-4 py-2 rounded-xl bg-card border border-border text-xs text-muted-foreground"
                      >
                        Mégse
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Add button */}
              {!showForm && (
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full py-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <Plus size={14} /> Új szabály hozzáadása
                </button>
              )}

              {/* Info note */}
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                ⚠️ Geofence szabályok csak nyitott böngészőtab mellett aktívak. Kézi indítás bármikor elérhető a ▶ gombbal.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}