import { useState, useEffect, useCallback } from 'react';
import { jarvis } from '@/api/jarvisClient';

const OWNER_ERROR = 'A saját adataid betöltéséhez be kell jelentkezned.';
import { Building2, Plus, Search, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import TutorialOverlay from '@/components/tutorial/TutorialOverlay';
import HoldingOverview from '@/components/holding/HoldingOverview';
import BusinessCard from '@/components/holding/BusinessCard';
import BusinessDetail from '@/components/holding/BusinessDetail';
import EcosystemOptimizer from '@/components/holding/EcosystemOptimizer';
import { businessesWithLedger } from '@/lib/financialLedger';

const INDUSTRIES = ['Technológia', 'Ingatlan', 'Kereskedelem', 'Marketing', 'Pénzügy', 'Egészségügy', 'Logisztika', 'Oktatás', 'Vendéglátás', 'Egyéb'];
const EMOJIS = ['🏢', '🏗️', '🛒', '💻', '🏠', '🚗', '🍕', '🏋️', '📦', '💊', '🎓', '🎯'];

export default function Holding() {
  const [businesses, setBusinesses] = useState([]);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [ownerError, setOwnerError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('mind');
  const [tab, setTab] = useState('businesses'); // 'businesses' | 'optimizer'
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: '', type: 'sajat', industry: '', logo_emoji: '🏢',
    revenue_monthly: '', expense_monthly: '', employee_count: '',
    contact_email: '', website: '', kpi_target_revenue: '', notes: '', status: 'aktiv'
  });

  const holdingTutorial = [
    {
      icon: '🏢',
      title: 'Holding Control',
      description: 'Kezelj több vállalkozást egy helyről. Nyomkövetés, projektek, csapatok.',
      hint: 'Minden vállalkozásnak saját részletoldala van',
    },
    {
      icon: '📊',
      title: 'Optimizer módusz',
      description: 'Az AI automatikusan elemzi az ökoszisztéma hatékonyságát és javaslatokat tesz.',
      hint: 'Nyomd meg az "⚡ Optimizer" fület',
    },
    {
      icon: '✨',
      title: 'Kezdj el!',
      description: 'Add hozzá az első vállalkozásodat a "+" gombbal.',
      hint: 'Válassz egy ikonot és tölts ki az alapinformációkat',
    },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    setOwnerError('');
    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email) {
      setBusinesses([]);
      setProjects([]);
      setEmployees([]);
      setClients([]);
      setInvoices([]);
      setOwnerError(OWNER_ERROR);
      setLoading(false);
      return;
    }
    const ownerFilter = { created_by: currentUser.email };
    try {
    const [b, p, e, c, inv, finance] = await Promise.all([
      jarvis.entities.Business.filter(ownerFilter, '-created_date'),
      jarvis.entities.BusinessProject.filter(ownerFilter, '-created_date'),
      jarvis.entities.Employee.filter(ownerFilter),
      jarvis.entities.BusinessClient.filter(ownerFilter),
      jarvis.entities.Invoice.filter(ownerFilter, '-created_date'),
      jarvis.entities.FinanceEntry.filter(ownerFilter),
    ]);
    setBusinesses(businessesWithLedger(b, finance));
    setProjects(p);
    setEmployees(e);
    setClients(c);
    setInvoices(inv);
    } catch {
      setBusinesses([]); setProjects([]); setEmployees([]); setClients([]); setInvoices([]);
      setOwnerError('Az üzleti adatok nem tölthetők be. A pénzügyi összesítések nem igazoltak.');
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addBusiness = async () => {
    if (!form.name.trim()) return;
    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email) {
      setOwnerError(OWNER_ERROR);
      return;
    }
    try {
    await jarvis.entities.Business.create({
      ...form,
      created_by: currentUser.email,
      revenue_monthly: parseFloat(form.revenue_monthly) || 0,
      expense_monthly: parseFloat(form.expense_monthly) || 0,
      employee_count: parseInt(form.employee_count) || 0,
      kpi_target_revenue: parseFloat(form.kpi_target_revenue) || 0,
    });
    await load();
    setForm({ name: '', type: 'sajat', industry: '', logo_emoji: '🏢', revenue_monthly: '', expense_monthly: '', employee_count: '', contact_email: '', website: '', kpi_target_revenue: '', notes: '', status: 'aktiv' });
    setShowAdd(false);
    } catch { setOwnerError('A vállalkozás nem menthető. Próbáld újra.'); }
  };

  const filtered = businesses.filter(b => {
    const matchSearch = b.name.toLowerCase().includes(search.toLowerCase()) || (b.industry || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'mind' || b.type === filter;
    return matchSearch && matchFilter;
  });

  if (selected) {
    const biz = businesses.find(b => b.id === selected);
    if (biz) return (
      <BusinessDetail
        business={biz}
        projects={projects}
        employees={employees}
        clients={clients}
        invoices={invoices}
        onBack={() => setSelected(null)}
        onRefresh={load}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <TutorialOverlay tutorialId="holding-intro" steps={holdingTutorial} />
      {/* Header */}
      <div className="px-4 pt-5 pb-3 shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center">
            <Building2 size={20} className="text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">Holding Control</h1>
            <p className="text-xs text-muted-foreground">{businesses.length} vállalkozás · {projects.filter(p=>p.status==='folyamatban').length} aktív projekt</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
            <Plus size={16} className="text-primary-foreground" />
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-card border border-border rounded-2xl px-3 py-2.5 mb-3">
          <Search size={15} className="text-muted-foreground shrink-0" />
          <input className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder="Keresés..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch('')}><X size={14} className="text-muted-foreground" /></button>}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2">
          <button onClick={() => setTab('businesses')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${tab === 'businesses' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
            🏢 Vállalkozások
          </button>
          <button onClick={() => setTab('optimizer')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${tab === 'optimizer' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
            ⚡ Optimizer
          </button>
          {tab === 'businesses' && (
            <>
              {[['mind', 'Mind'], ['sajat', 'Saját'], ['ugyfel', 'Ügyfél']].map(([key, label]) => (
                <button key={key} onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filter === key ? 'bg-secondary border border-primary text-foreground' : 'bg-secondary text-muted-foreground'}`}>
                  {label}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="text-primary animate-spin" /></div>
        ) : ownerError ? (
          <div className="text-center py-12 text-sm text-muted-foreground">{ownerError}</div>
        ) : (
          <>
            {tab === 'optimizer' ? (
              <EcosystemOptimizer />
            ) : (
              <>
                {/* Overview */}
                {businesses.length > 0 && (
                  <HoldingOverview
                    businesses={businesses}
                    projects={projects}
                    employees={employees}
                    clients={clients}
                  />
                )}

                {/* Business list */}
                <div className="space-y-3">
                  {filtered.length === 0 ? (
                    <div className="text-center py-12">
                      <Building2 size={40} className="mx-auto text-muted-foreground/20 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {businesses.length === 0 ? 'Adj hozzá vállalkozásokat a Holding-hoz!' : 'Nincs találat'}
                      </p>
                      {businesses.length === 0 && (
                        <button onClick={() => setShowAdd(true)} className="mt-3 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                          + Első vállalkozás hozzáadása
                        </button>
                      )}
                    </div>
                  ) : (
                    filtered.map(b => (
                      <BusinessCard
                        key={b.id}
                        business={b}
                        employeeCount={employees.filter(e => e.business_id === b.id).length}
                        projectCount={projects.filter(p => p.business_id === b.id).length}
                        onClick={() => setSelected(b.id)}
                      />
                    ))
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Add Business Modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-end">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-semibold text-foreground">Új vállalkozás</h2>
                <button onClick={() => setShowAdd(false)}><X size={18} className="text-muted-foreground" /></button>
              </div>

              <div className="space-y-3">
                {/* Emoji picker */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Ikon</p>
                  <div className="flex flex-wrap gap-2">
                    {EMOJIS.map(e => (
                      <button key={e} onClick={() => setForm(f => ({...f, logo_emoji: e}))}
                        className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all ${form.logo_emoji === e ? 'bg-primary/20 ring-2 ring-primary' : 'bg-secondary'}`}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
                  placeholder="Vállalkozás neve *" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />

                <div className="grid grid-cols-2 gap-2">
                  <select className="bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-border text-foreground"
                    value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))}>
                    <option value="sajat">🏢 Saját cég</option>
                    <option value="ugyfel">🤝 Ügyfél portfolió</option>
                  </select>
                  <select className="bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-border text-foreground"
                    value={form.industry} onChange={e => setForm(f => ({...f, industry: e.target.value}))}>
                    <option value="">Iparág...</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input className="bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-border text-foreground"
                    placeholder="Havi bevétel £" type="number" value={form.revenue_monthly}
                    onChange={e => setForm(f => ({...f, revenue_monthly: e.target.value}))} />
                  <input className="bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-border text-foreground"
                    placeholder="Havi kiadás £" type="number" value={form.expense_monthly}
                    onChange={e => setForm(f => ({...f, expense_monthly: e.target.value}))} />
                </div>

                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
                  placeholder="KPI – Bevételi cél £" type="number" value={form.kpi_target_revenue}
                  onChange={e => setForm(f => ({...f, kpi_target_revenue: e.target.value}))} />

                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
                  placeholder="Email" value={form.contact_email} onChange={e => setForm(f => ({...f, contact_email: e.target.value}))} />

                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
                  placeholder="Weboldal" value={form.website} onChange={e => setForm(f => ({...f, website: e.target.value}))} />

                <textarea className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground resize-none"
                  rows={2} placeholder="Megjegyzés" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />

                <button onClick={addBusiness} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm">
                  Vállalkozás hozzáadása
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
