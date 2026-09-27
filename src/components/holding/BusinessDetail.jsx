import { useState } from 'react';
import { jarvis } from '@/api/jarvisClient';

const OWNER_ERROR = 'A saját adataid kezeléséhez be kell jelentkezned.';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import MobileSelect from '@/components/common/MobileSelect';
import { motion, AnimatePresence } from 'framer-motion';

const TABS = ['Áttekintés', 'Projektek', 'HR', 'Ügyfelek', 'Számlák'];

const statusColors = {
  tervezes: 'bg-yellow-400/15 text-yellow-400',
  folyamatban: 'bg-blue-400/15 text-blue-400',
  kesz: 'bg-green-400/15 text-green-400',
  megszakitva: 'bg-red-400/15 text-red-400',
  aktiv: 'bg-green-400/15 text-green-400',
  inaktiv: 'bg-muted text-muted-foreground',
  potencial: 'bg-purple-400/15 text-purple-400',
  szabadsagon: 'bg-orange-400/15 text-orange-400',
};

export default function BusinessDetail({ business, projects, employees, clients, invoices, onBack, onRefresh }) {
  const [tab, setTab] = useState('Áttekintés');
  const [ownerError, setOwnerError] = useState('');
  const [showAddProject, setShowAddProject] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: '', status: 'tervezes', budget: '', priority: 'kozepes', end_date: '' });
  const [employeeForm, setEmployeeForm] = useState({ name: '', role: '', email: '', salary_monthly: '', department: '' });
  const [clientForm, setClientForm] = useState({ name: '', email: '', phone: '', company: '', status: 'aktiv' });

  const profit = (business.revenue_monthly || 0) - (business.expense_monthly || 0);
  const totalSalary = employees.reduce((s, e) => s + (e.salary_monthly || 0), 0);
  const bClients = clients.filter(c => c.business_id === business.id);
  const bEmployees = employees.filter(e => e.business_id === business.id);
  const bProjects = projects.filter(p => p.business_id === business.id);
  const bInvoices = invoices.filter(i => i.business_id === business.id);

  const addProject = async () => {
    if (!projectForm.name.trim()) return;
    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email || business.created_by !== currentUser.email) {
      setOwnerError(OWNER_ERROR);
      return;
    }
    await jarvis.entities.BusinessProject.create({ ...projectForm, created_by: currentUser.email, business_id: business.id, budget: parseFloat(projectForm.budget) || 0, progress: 0 });
    setProjectForm({ name: '', status: 'tervezes', budget: '', priority: 'kozepes', end_date: '' });
    setShowAddProject(false);
    onRefresh();
  };

  const addEmployee = async () => {
    if (!employeeForm.name.trim()) return;
    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email || business.created_by !== currentUser.email) {
      setOwnerError(OWNER_ERROR);
      return;
    }
    await jarvis.entities.Employee.create({ ...employeeForm, created_by: currentUser.email, business_id: business.id, salary_monthly: parseFloat(employeeForm.salary_monthly) || 0, status: 'aktiv' });
    setEmployeeForm({ name: '', role: '', email: '', salary_monthly: '', department: '' });
    setShowAddEmployee(false);
    onRefresh();
  };

  const addClient = async () => {
    if (!clientForm.name.trim()) return;
    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email || business.created_by !== currentUser.email) {
      setOwnerError(OWNER_ERROR);
      return;
    }
    await jarvis.entities.BusinessClient.create({ ...clientForm, created_by: currentUser.email, business_id: business.id });
    setClientForm({ name: '', email: '', phone: '', company: '', status: 'aktiv' });
    setShowAddClient(false);
    onRefresh();
  };

  const deleteProject = async (id) => {
    const currentUser = await jarvis.auth.me().catch(() => null);
    const item = bProjects.find((project) => project.id === id);
    if (!currentUser?.email || item?.created_by !== currentUser.email) {
      setOwnerError(OWNER_ERROR);
      return;
    }
    await jarvis.entities.BusinessProject.delete(id);
    onRefresh();
  };
  const deleteEmployee = async (id) => {
    const currentUser = await jarvis.auth.me().catch(() => null);
    const item = bEmployees.find((employee) => employee.id === id);
    if (!currentUser?.email || item?.created_by !== currentUser.email) {
      setOwnerError(OWNER_ERROR);
      return;
    }
    await jarvis.entities.Employee.delete(id);
    onRefresh();
  };
  const deleteClient = async (id) => {
    const currentUser = await jarvis.auth.me().catch(() => null);
    const item = bClients.find((client) => client.id === id);
    if (!currentUser?.email || item?.created_by !== currentUser.email) {
      setOwnerError(OWNER_ERROR);
      return;
    }
    await jarvis.entities.BusinessClient.delete(id);
    onRefresh();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 shrink-0">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
          <ArrowLeft size={16} className="text-muted-foreground" />
        </button>
        <div className="text-2xl">{business.logo_emoji || '🏢'}</div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-foreground truncate">{business.name}</p>
          <p className="text-xs text-muted-foreground">{business.industry}</p>
        </div>
        <div className={`text-sm font-bold ${profit >= 0 ? 'text-primary' : 'text-red-400'}`}>
          {profit >= 0 ? '+' : ''}£{profit.toLocaleString()}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pb-3 overflow-x-auto shrink-0" style={{ scrollbarWidth: 'none' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${tab === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
        {ownerError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 text-xs text-red-400">{ownerError}</div>
        )}
        {/* ÁTTEKINTÉS */}
        {tab === 'Áttekintés' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Havi bevétel', val: `£${(business.revenue_monthly||0).toLocaleString()}`, color: 'text-green-400' },
                { label: 'Havi kiadás', val: `£${(business.expense_monthly||0).toLocaleString()}`, color: 'text-red-400' },
                { label: 'Profit', val: `£${profit.toLocaleString()}`, color: profit >= 0 ? 'text-primary' : 'text-red-400' },
                { label: 'Bérköltség', val: `£${totalSalary.toLocaleString()}`, color: 'text-orange-400' },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-card border border-border rounded-2xl p-3">
                  <p className={`text-lg font-bold ${color}`}>{val}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            {business.notes && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-1">Megjegyzés</p>
                <p className="text-sm text-foreground">{business.notes}</p>
              </div>
            )}
            <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
              {business.contact_email && <p className="text-xs text-muted-foreground">📧 {business.contact_email}</p>}
              {business.contact_phone && <p className="text-xs text-muted-foreground">📞 {business.contact_phone}</p>}
              {business.website && <p className="text-xs text-primary">{business.website}</p>}
              {business.founded_date && <p className="text-xs text-muted-foreground">📅 Alapítva: {business.founded_date}</p>}
            </div>
            {/* KPI progress */}
            {business.kpi_target_revenue > 0 && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <p className="text-xs font-semibold text-foreground mb-2">KPI – Bevételi cél</p>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>£{(business.revenue_monthly||0).toLocaleString()}</span>
                  <span>£{business.kpi_target_revenue.toLocaleString()}</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, ((business.revenue_monthly||0) / business.kpi_target_revenue) * 100)}%` }} />
                </div>
              </div>
            )}
          </>
        )}

        {/* PROJEKTEK */}
        {tab === 'Projektek' && (
          <>
            <button onClick={() => setShowAddProject(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-primary/10 border border-primary/30 text-primary text-sm font-medium">
              <Plus size={15} /> Új projekt
            </button>
            {bProjects.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">Nincsenek projektek</p>}
            {bProjects.map(p => (
              <div key={p.id} className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-foreground">{p.name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[p.status]}`}>{p.status}</span>
                    </div>
                    {p.budget > 0 && <p className="text-xs text-muted-foreground">Budget: £{p.budget.toLocaleString()}</p>}
                    {p.end_date && <p className="text-xs text-muted-foreground">Határidő: {p.end_date}</p>}
                    {p.progress > 0 && (
                      <div className="mt-2">
                        <div className="w-full bg-secondary rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-primary" style={{ width: `${p.progress}%` }} />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{p.progress}% kész</p>
                      </div>
                    )}
                  </div>
                  <button onClick={() => deleteProject(p.id)} className="text-muted-foreground/40 hover:text-red-400 shrink-0"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* HR */}
        {tab === 'HR' && (
          <>
            <button onClick={() => setShowAddEmployee(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm font-medium">
              <Plus size={15} /> Új munkatárs
            </button>
            {bEmployees.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">Nincsenek munkatársak</p>}
            {bEmployees.map(e => (
              <div key={e.id} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-400/10 flex items-center justify-center text-lg shrink-0">👤</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.role}{e.department ? ` · ${e.department}` : ''}</p>
                  {e.salary_monthly > 0 && <p className="text-xs text-primary">£{e.salary_monthly.toLocaleString()}/hó</p>}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColors[e.status]}`}>{e.status}</span>
                <button onClick={() => deleteEmployee(e.id)} className="text-muted-foreground/40 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            ))}
          </>
        )}

        {/* ÜGYFELEK */}
        {tab === 'Ügyfelek' && (
          <>
            <button onClick={() => setShowAddClient(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm font-medium">
              <Plus size={15} /> Új ügyfél
            </button>
            {bClients.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">Nincsenek ügyfelek</p>}
            {bClients.map(c => (
              <div key={c.id} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-400/10 flex items-center justify-center text-lg shrink-0">🧑‍💼</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.company || c.email || ''}</p>
                  {c.total_revenue > 0 && <p className="text-xs text-primary">£{c.total_revenue.toLocaleString()} bevétel</p>}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColors[c.status]}`}>{c.status}</span>
                <button onClick={() => deleteClient(c.id)} className="text-muted-foreground/40 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            ))}
          </>
        )}

        {/* SZÁMLÁK */}
        {tab === 'Számlák' && (
          <>
            {bInvoices.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">Nincsenek számlák ehhez a céghez</p>}
            {bInvoices.map(inv => (
              <div key={inv.id} className="bg-card border border-border rounded-2xl p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{inv.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">{inv.client_name}</p>
                    <p className="text-xs text-muted-foreground">{inv.issue_date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">£{(inv.total_amount||0).toLocaleString()}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${inv.status === 'kifizetve' ? 'bg-green-400/15 text-green-400' : 'bg-yellow-400/15 text-yellow-400'}`}>{inv.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showAddProject && (
          <Modal title="Új projekt" onClose={() => setShowAddProject(false)}>
            <input className="input-field" placeholder="Projekt neve *" value={projectForm.name} onChange={e => setProjectForm(f => ({...f, name: e.target.value}))} />
            <input className="input-field" placeholder="Budget £" type="number" value={projectForm.budget} onChange={e => setProjectForm(f => ({...f, budget: e.target.value}))} />
            <input className="input-field" placeholder="Határidő (ÉÉÉÉ-HH-NN)" value={projectForm.end_date} onChange={e => setProjectForm(f => ({...f, end_date: e.target.value}))} />
            <div className="grid grid-cols-2 gap-2">
              <MobileSelect
                value={projectForm.status}
                onChange={v => setProjectForm(f => ({...f, status: v}))}
                options={['tervezes','folyamatban','kesz','megszakitva'].map(s => ({ value: s, label: s }))}
                placeholder="Státusz"
              />
              <MobileSelect
                value={projectForm.priority}
                onChange={v => setProjectForm(f => ({...f, priority: v}))}
                options={['alacsony','kozepes','magas'].map(s => ({ value: s, label: s }))}
                placeholder="Prioritás"
              />
            </div>
            <button onClick={addProject} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">Létrehozás</button>
          </Modal>
        )}
        {showAddEmployee && (
          <Modal title="Új munkatárs" onClose={() => setShowAddEmployee(false)}>
            <input className="input-field" placeholder="Név *" value={employeeForm.name} onChange={e => setEmployeeForm(f => ({...f, name: e.target.value}))} />
            <input className="input-field" placeholder="Beosztás" value={employeeForm.role} onChange={e => setEmployeeForm(f => ({...f, role: e.target.value}))} />
            <input className="input-field" placeholder="Osztály" value={employeeForm.department} onChange={e => setEmployeeForm(f => ({...f, department: e.target.value}))} />
            <input className="input-field" placeholder="Email" value={employeeForm.email} onChange={e => setEmployeeForm(f => ({...f, email: e.target.value}))} />
            <input className="input-field" placeholder="Havi fizetés £" type="number" value={employeeForm.salary_monthly} onChange={e => setEmployeeForm(f => ({...f, salary_monthly: e.target.value}))} />
            <button onClick={addEmployee} className="w-full py-2.5 rounded-xl bg-purple-500 text-white font-semibold text-sm">Hozzáadás</button>
          </Modal>
        )}
        {showAddClient && (
          <Modal title="Új ügyfél" onClose={() => setShowAddClient(false)}>
            <input className="input-field" placeholder="Név *" value={clientForm.name} onChange={e => setClientForm(f => ({...f, name: e.target.value}))} />
            <input className="input-field" placeholder="Cég neve" value={clientForm.company} onChange={e => setClientForm(f => ({...f, company: e.target.value}))} />
            <input className="input-field" placeholder="Email" value={clientForm.email} onChange={e => setClientForm(f => ({...f, email: e.target.value}))} />
            <input className="input-field" placeholder="Telefon" value={clientForm.phone} onChange={e => setClientForm(f => ({...f, phone: e.target.value}))} />
            <MobileSelect
              value={clientForm.status}
              onChange={v => setClientForm(f => ({...f, status: v}))}
              options={['aktiv','inaktiv','potencial'].map(s => ({ value: s, label: s }))}
              placeholder="Státusz"
            />
            <button onClick={addClient} className="w-full py-2.5 rounded-xl bg-blue-500 text-white font-semibold text-sm">Hozzáadás</button>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 z-50 flex items-end">
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25 }}
        className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button onClick={onClose}><X size={18} className="text-muted-foreground" /></button>
        </div>
        <div className="space-y-2">{children}</div>
      </motion.div>
    </motion.div>
  );
}