import { useState, useEffect } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { ArrowLeft, FileText, Plus, X, Trash2, Bot, Loader2, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '@/lib/i18n';
import { localDateKey } from '@/lib/localDate';
import { jsPDF } from 'jspdf';

const genNumber = () => 'INV-' + Math.random().toString(36).substring(2, 10).toUpperCase();
const today = () => localDateKey();

const statusColors = {
  piszkozat: 'bg-secondary text-muted-foreground',
  kiallitva: 'bg-blue-500/20 text-blue-400',
  kifizetve: 'bg-primary/20 text-primary',
  lejart: 'bg-red-500/20 text-red-400',
};
const statusLabels = { piszkozat: 'Piszkozat', kiallitva: 'Kiállítva', kifizetve: 'Kifizetve', lejart: 'Lejárt' };

export default function InvoiceTool() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [invoices, setInvoices] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(null);
  const [form, setForm] = useState({ invoice_number: genNumber(), client_name: '', client_email: '', issue_date: today(), due_date: '', items: [{ description: '', quantity: 1, unit_price: 0, total: 0 }], status: 'piszkozat', notes: '' });

  useEffect(() => {
    jarvis.auth.me()
      .then((currentUser) => {
        if (!currentUser?.email) throw new Error('auth_required');
        return jarvis.entities.Invoice.filter({ created_by: currentUser.email }, '-issue_date');
      })
      .then(setInvoices)
      .catch((error) => {
        console.error('Invoice load error:', error);
        setErrorMessage('A számlákat most nem tudtuk betölteni.');
      })
      .finally(() => setPageLoading(false));
  }, []);

  const updateItem = (i, field, value) => {
    const items = [...form.items];
    items[i] = { ...items[i], [field]: value };
    if (field === 'quantity' || field === 'unit_price') {
      items[i].total = (field === 'quantity' ? parseFloat(value) : items[i].quantity) * (field === 'unit_price' ? parseFloat(value) : items[i].unit_price);
    }
    setForm(f => ({ ...f, items, total_amount: items.reduce((s, it) => s + (it.total || 0), 0) }));
  };

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { description: '', quantity: 1, unit_price: 0, total: 0 }] }));

  const saveInvoice = async () => {
    const total = form.items.reduce((s, it) => s + (it.total || 0), 0);
    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email) {
      setErrorMessage('A számlákat most nem tudtuk betölteni.');
      return;
    }
    const created = await jarvis.entities.Invoice.create({ ...form, created_by: currentUser.email, total_amount: total });
    setInvoices(prev => [created, ...prev]);
    setShowCreate(false);
    setForm({ invoice_number: genNumber(), client_name: '', client_email: '', issue_date: today(), due_date: '', items: [{ description: '', quantity: 1, unit_price: 0, total: 0 }], status: 'piszkozat', notes: '' });
  };

  const deleteInvoice = async (id) => {
    const currentUser = await jarvis.auth.me().catch(() => null);
    const invoice = invoices.find((item) => item.id === id);
    if (!currentUser?.email || invoice?.created_by !== currentUser.email) return;
    await jarvis.entities.Invoice.delete(id);
    setInvoices(prev => prev.filter(i => i.id !== id));
  };

  const updateStatus = async (id, status) => {
    const currentUser = await jarvis.auth.me().catch(() => null);
    const invoice = invoices.find((item) => item.id === id);
    if (!currentUser?.email || invoice?.created_by !== currentUser.email) return;
    await jarvis.entities.Invoice.update(id, { status });
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status } : i));
  };

  const generateWithAI = async () => {
    setAiLoading(true);
    try {
      const response = await jarvis.functions.invoke('runAiTask', {
        prompt: 'Generálj egy minta számlát JSON formátumban: {"client_name": "...", "client_email": "...", "notes": "...", "items": [{"description": "...", "quantity": 1, "unit_price": 100, "total": 100}]}. Csak a JSON-t add vissza.'
      });
      const result = response.data?.result || '';
      const parsed = JSON.parse(result.replace(/```json|```/g, '').trim());
      setForm(f => ({ ...f, ...parsed, total_amount: parsed.items?.reduce((s, it) => s + (it.total || 0), 0) || 0 }));
    } catch (error) {
      console.error('Invoice AI generation error:', error);
      setErrorMessage('A minta számlát most nem tudtuk elkészíteni.');
    } finally {
      setAiLoading(false);
    }
  };

  const exportPDF = async (inv) => {
    setPdfLoading(inv.id);
    setErrorMessage('');
    try {
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text('SZÁMLA / INVOICE', 20, 25);
      doc.setFontSize(11);
      doc.text(`Számlaszám: ${inv.invoice_number || ''}`, 20, 45);
      doc.text(`Dátum: ${inv.issue_date || today()}`, 20, 55);
      doc.text(`Vevő: ${inv.client_name || 'N/A'}`, 20, 70);
      let y = 90;
      for (const item of inv.items || []) {
        if (y > 260) { doc.addPage(); y = 20; }
        doc.text(`${item.description || ''} – ${item.quantity || 1} × £${item.unit_price || 0} = £${item.total || 0}`, 20, y);
        y += 10;
      }
      doc.setFontSize(14);
      doc.text(`ÖSSZESEN: £${Number(inv.total_amount || 0).toFixed(2)}`, 20, y + 10);
      doc.save(`${inv.invoice_number || 'invoice'}.pdf`);
    } catch (error) {
      console.error('Invoice PDF export error:', error);
      setErrorMessage('A PDF exportálása nem sikerült.');
    } finally {
      setPdfLoading(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate('/eszkozok')} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <ArrowLeft size={16} className="text-muted-foreground" />
          </button>
          <div className="w-9 h-9 rounded-2xl bg-teal-500/20 flex items-center justify-center">
            <FileText size={18} className="text-teal-400" />
          </div>
          <h1 className="text-xl font-bold text-foreground">{t('invoices')}</h1>
        </div>

        <button onClick={() => setShowCreate(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm mb-2">
          <Plus size={16} /> {t('new_invoice')}
        </button>
        {errorMessage && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 mb-4 text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        {pageLoading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="text-primary animate-spin" /></div>
        ) : (
        <div className="space-y-3">
          {invoices.map(inv => (
            <div key={inv.id} className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-4 flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-mono font-semibold text-foreground">{inv.invoice_number}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[inv.status]}`}>
                      {statusLabels[inv.status]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{inv.client_name || 'Nincs megadva vevő'}</p>
                  <p className="text-xs text-muted-foreground">{inv.issue_date}</p>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <p className="text-base font-bold text-foreground">£{(inv.total_amount || 0).toFixed(2)}</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => exportPDF(inv)} className="text-muted-foreground hover:text-primary p-1">
                      {pdfLoading === inv.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    </button>
                    <button onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)} className="text-muted-foreground p-1">
                      {expandedId === inv.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>
              </div>
              <AnimatePresence>
                {expandedId === inv.id && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t border-border">
                    <div className="p-4 space-y-2">
                      {inv.client_email && <p className="text-xs text-muted-foreground">📧 {inv.client_email}</p>}
                      {inv.items?.map((it, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-foreground">{it.description}</span>
                          <span className="text-muted-foreground">{it.quantity} × £{it.unit_price} = £{it.total}</span>
                        </div>
                      ))}
                      {inv.notes && <p className="text-xs text-muted-foreground italic">{inv.notes}</p>}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {Object.entries(statusLabels).map(([key, label]) => (
                          <button key={key} onClick={() => updateStatus(inv.id, key)}
                            className={`px-3 py-1 rounded-full text-xs font-medium ${inv.status === key ? statusColors[key] : 'bg-secondary text-muted-foreground'}`}>
                            {label}
                          </button>
                        ))}
                        <button onClick={() => deleteInvoice(inv.id)} className="px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-xs">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
          {invoices.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">{t('no_invoices')}</p>}
        </div>
        )}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 z-50 flex items-end overflow-hidden">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-semibold text-foreground">Új számla</h2>
                <div className="flex gap-2">
                  <button onClick={generateWithAI} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs">
                    {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />} AI generálás
                  </button>
                  <button onClick={() => setShowCreate(false)}><X size={18} className="text-muted-foreground" /></button>
                </div>
              </div>
              <div className="space-y-3">
                <div className="bg-secondary rounded-xl px-3 py-2">
                  <p className="text-xs text-muted-foreground">Számlaszám</p>
                  <p className="text-sm font-mono font-semibold text-foreground">{form.invoice_number}</p>
                </div>
                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground" placeholder="Vevő neve" value={form.client_name} onChange={e => setForm(f => ({...f, client_name: e.target.value}))} />
                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground" placeholder="Vevő email" value={form.client_email} onChange={e => setForm(f => ({...f, client_email: e.target.value}))} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Kiállítás dátuma</p>
                    <input type="date" className="w-full bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground" value={form.issue_date} onChange={e => setForm(f => ({...f, issue_date: e.target.value}))} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Fizetési határidő</p>
                    <input type="date" className="w-full bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground" value={form.due_date} onChange={e => setForm(f => ({...f, due_date: e.target.value}))} />
                  </div>
                </div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tételek</p>
                {form.items.map((item, i) => (
                  <div key={i} className="bg-secondary rounded-xl p-3 space-y-2">
                    <input className="w-full bg-background rounded-lg px-3 py-2 text-sm outline-none text-foreground" placeholder="Leírás" value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} />
                    <div className="grid grid-cols-3 gap-2">
                      <input className="bg-background rounded-lg px-2 py-1.5 text-sm outline-none text-foreground text-center" type="number" placeholder="Db" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} />
                      <input className="bg-background rounded-lg px-2 py-1.5 text-sm outline-none text-foreground text-center" type="number" placeholder="Ár £" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} />
                      <div className="bg-primary/10 rounded-lg px-2 py-1.5 text-sm text-primary text-center font-medium">£{(item.total||0).toFixed(2)}</div>
                    </div>
                  </div>
                ))}
                <button onClick={addItem} className="w-full py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground">+ Tétel hozzáadása</button>
                <div className="flex justify-between items-center bg-primary/10 rounded-xl p-3">
                  <span className="text-sm font-semibold text-foreground">Összesen:</span>
                  <span className="text-lg font-bold text-primary">£{form.items.reduce((s,it)=>s+(it.total||0),0).toFixed(2)}</span>
                </div>
                <textarea className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground resize-none" rows={2} placeholder="Megjegyzések..." value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
                <button onClick={saveInvoice} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold">Számla létrehozása</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}