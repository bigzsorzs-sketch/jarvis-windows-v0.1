import { useState, useEffect } from 'react';
import TutorialOverlay from '@/components/tutorial/TutorialOverlay';
import { jarvis } from '@/api/jarvisClient';
import { useLang } from '@/lib/i18n';
import { ArrowLeft, DollarSign, TrendingUp, TrendingDown, Camera, Image, Plus, X, Briefcase, User, Bot, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import SensitiveValue from '@/components/common/SensitiveValue';
import { maskCurrency } from '@/lib/dataMasker';

const today = () => new Date().toISOString().split('T')[0];

export default function FinanceTool() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [tab, setTab] = useState('attekintes');
  const [entries, setEntries] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ description: '', amount: '', type: 'income', category: 'magan', date: today() });
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    jarvis.auth.me()
      .then((user) => {
        if (!user?.email) throw new Error('auth_required');
        return jarvis.entities.FinanceEntry.filter({ created_by: user.email }, '-date');
      })
      .then(setEntries)
      .catch(() => {
        setErrorMessage(t('finance_load_error'));
      })
      .finally(() => setPageLoading(false));
  }, [t]);

  const save = async () => {
    if (!form.description || !form.amount) return;
    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email) {
      setErrorMessage(t('finance_load_error'));
      return;
    }
    const created = await jarvis.entities.FinanceEntry.create({ ...form, created_by: currentUser.email, amount: parseFloat(form.amount) });
    setEntries(prev => [created, ...prev]);
    setForm({ description: '', amount: '', type: 'income', category: 'magan', date: today() });
    setShowAdd(false);
  };

  const deleteEntry = async (id) => {
    const currentUser = await jarvis.auth.me().catch(() => null);
    const entry = entries.find((item) => item.id === id);
    if (!currentUser?.email || entry?.created_by !== currentUser.email) return;
    await jarvis.entities.FinanceEntry.delete(id);
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const now = new Date();
  const thisMonth = entries.filter(e => e.date?.startsWith(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`));
  const monthIncome = thisMonth.filter(e => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0);
  const monthExpense = thisMonth.filter(e => e.type === 'expense').reduce((s, e) => s + (e.amount || 0), 0);
  const totalBalance = entries.filter(e=>e.type==='income').reduce((s,e)=>s+(e.amount||0),0) - entries.filter(e=>e.type==='expense').reduce((s,e)=>s+(e.amount||0),0);

  const cegesIncome = entries.filter(e=>e.category==='ceges'&&e.type==='income').reduce((s,e)=>s+(e.amount||0),0);
  const cegesExpense = entries.filter(e=>e.category==='ceges'&&e.type==='expense').reduce((s,e)=>s+(e.amount||0),0);
  const maganIncome = entries.filter(e=>e.category==='magan'&&e.type==='income').reduce((s,e)=>s+(e.amount||0),0);
  const maganExpense = entries.filter(e=>e.category==='magan'&&e.type==='expense').reduce((s,e)=>s+(e.amount||0),0);

  const getAiAnalysis = async () => {
    setAiLoading(true);
    const summary = `Teljes egyenleg: £${totalBalance.toFixed(2)}, Havi bevétel: £${monthIncome.toFixed(2)}, Havi kiadás: £${monthExpense.toFixed(2)}, Céges: £${(cegesIncome-cegesExpense).toFixed(2)}, Magán: £${(maganIncome-maganExpense).toFixed(2)}`;
    try {
      const response = await jarvis.functions.invoke('runAiTask', {
        prompt: `Magyar pénzügyi asszisztensként elemezd ezt a pénzügyi helyzetet és adj 3 rövid tanácsot:\n${summary}\nMagyarul válaszolj, tömören.`
      });
      setAiAnalysis(response.data?.result || '');
    } catch (error) {
      console.error('Finance AI analysis error:', error);
      setErrorMessage('Az elemzést most nem tudtuk elkészíteni.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleScanFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setScanLoading(true);
    setErrorMessage('');
    try {
      const uploadForm = new FormData();
      uploadForm.append('file', file);
      const uploadRes = await jarvis.functions.invoke('validateFileUpload', uploadForm);
      const file_url = uploadRes?.data?.file_url;
      if (!file_url) {
        setErrorMessage('A fájlt most nem tudtuk feldolgozni.');
        return;
      }
      const response = await jarvis.functions.invoke('runAiTask', {
        prompt: 'Olvasd ki ebből a blokkból/számláról a következő adatokat JSON formátumban: {"description": "...", "amount": number, "date": "YYYY-MM-DD"}. Csak a JSON-t add vissza.',
        file_urls: [file_url]
      });
      const result = response.data?.result || '';
      try {
        const parsed = JSON.parse(result.replace(/```json|```/g, '').trim());
        setForm(f => ({ ...f, ...parsed, type: 'expense' }));
        setShowAdd(true);
      } catch (error) {
        console.error('Finance receipt parse error:', error);
        setErrorMessage('A blokk adatait nem sikerült kiolvasni.');
      }
    } catch (error) {
      console.error('Finance receipt scan error:', error);
      setErrorMessage('A blokk beolvasása most nem sikerült.');
    } finally {
      setScanLoading(false);
    }
  };

  const financeTutorial = [
    {
      icon: '💰',
      title: 'Pénzügyek kezelése',
      description: 'Követsd nyomon jövedelmeid és kiadásaidat. Az AI automatikusan feldolgozza a nyugtákat.',
      hint: 'Kattints a kamera gombra a nyugták fotózásához',
    },
    {
      icon: '📊',
      title: 'Elemzések és insights',
      description: 'Az AI automatikus pénzügyi elemzést végez minden bejegyzésre.',
      hint: 'Az "AI Pénzügyi elemzés" gomb meghívja az LLM-et',
    },
    {
      icon: '✅',
      title: 'Kezdj el!',
      description: 'Add hozzá az első bejegyzésedet, és nézzük meg az adatokat.',
      hint: 'Kattints a „Kézi tétel hozzáadása” gombra',
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-background">
      <TutorialOverlay tutorialId="finance-intro" steps={financeTutorial} />
      <div className="px-4 pt-5 pb-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/eszkozok')} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <ArrowLeft size={16} className="text-muted-foreground" />
          </button>
          <div className="w-9 h-9 rounded-2xl bg-green-500/20 flex items-center justify-center">
            <DollarSign size={18} className="text-green-400" />
          </div>
          <h1 className="text-xl font-bold text-foreground">{t('finance')}</h1>
        </div>

        {/* Tabs */}
        <div className="flex bg-secondary rounded-2xl p-1 mb-5">
          {[['attekintes', `📊 ${t('overview_tab')}`], ['tetelek', `📋 ${t('entries_tab')}`]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${tab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
              {label}
            </button>
          ))}
        </div>

        {errorMessage && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 mb-4 text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        {pageLoading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="text-primary animate-spin" /></div>
        ) : tab === 'attekintes' && (
          <div className="space-y-3">
            {/* Total */}
            <div className="bg-card border border-border rounded-2xl p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">{t('total_balance')}</p>
              <SensitiveValue
                className={`text-4xl font-bold ${totalBalance >= 0 ? 'text-primary' : 'text-red-400'}`}
                maskedValue={maskCurrency(totalBalance)}
              >
                {totalBalance >= 0 ? '+' : ''}£{totalBalance.toFixed(2)}
              </SensitiveValue>
              <div className="flex justify-center gap-4 mt-2 text-xs text-muted-foreground">
                <SensitiveValue maskedValue={`↙ ${t('total_income')}: ${maskCurrency(0)}`} buttonLabel="Megtekintés">
                  ↙ {t('total_income')}: £{entries.filter(e=>e.type==='income').reduce((s,e)=>s+(e.amount||0),0).toFixed(2)}
                </SensitiveValue>
                <SensitiveValue maskedValue={`↗ ${t('total_expense')}: ${maskCurrency(0)}`} buttonLabel="Megtekintés">
                  ↗ {t('total_expense')}: £{entries.filter(e=>e.type==='expense').reduce((s,e)=>s+(e.amount||0),0).toFixed(2)}
                </SensitiveValue>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-2xl p-4">
                <p className="text-xs text-muted-foreground mb-1">{t('monthly_income')}</p>
                <SensitiveValue className="text-2xl font-bold text-primary" maskedValue={maskCurrency(monthIncome)}>
                  £{monthIncome.toFixed(2)}
                </SensitiveValue>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <p className="text-xs text-muted-foreground mb-1">{t('monthly_expense')}</p>
                <SensitiveValue className="text-2xl font-bold text-red-400" maskedValue={maskCurrency(monthExpense)}>
                  £{monthExpense.toFixed(2)}
                </SensitiveValue>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-xs text-muted-foreground mb-1">{t('monthly_balance')}</p>
              <p className={`text-2xl font-bold ${(monthIncome-monthExpense)>=0?'text-primary':'text-red-400'}`}>
                {(monthIncome-monthExpense)>=0?'+':''}£{(monthIncome-monthExpense).toFixed(2)}
              </p>
            </div>

            {/* Ceges vs Magan */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-sm font-semibold text-foreground mb-3">{t('business_vs_personal')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Briefcase size={14} className="text-blue-400" />
                    <span className="text-sm font-medium text-foreground">{t('business')}</span>
                  </div>
                  <p className="text-sm text-primary">+£{cegesIncome.toFixed(2)}</p>
                  <p className="text-sm text-red-400">-£{cegesExpense.toFixed(2)}</p>
                  <p className={`text-sm font-bold mt-1 ${(cegesIncome-cegesExpense)>=0?'text-primary':'text-red-400'}`}>
                    £{(cegesIncome-cegesExpense).toFixed(2)}
                  </p>
                </div>
                <div className="bg-secondary rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <User size={14} className="text-purple-400" />
                    <span className="text-sm font-medium text-foreground">{t('personal')}</span>
                  </div>
                  <p className="text-sm text-primary">+£{maganIncome.toFixed(2)}</p>
                  <p className="text-sm text-red-400">-£{maganExpense.toFixed(2)}</p>
                  <p className={`text-sm font-bold mt-1 ${(maganIncome-maganExpense)>=0?'text-primary':'text-red-400'}`}>
                    +£{(maganIncome-maganExpense).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Blokk scan */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">📸</span>
                <span className="text-sm font-semibold text-foreground">{t('receipt_scan')}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{t('scan_receipt')}</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-center gap-2 py-3 rounded-xl bg-yellow-500 text-black font-semibold text-sm cursor-pointer">
                  {scanLoading ? <Loader2 size={16} className="animate-spin" /> : <><Camera size={16} /> {t('camera')}</>}
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScanFile} />
                </label>
                <label className="flex items-center justify-center gap-2 py-3 rounded-xl border border-yellow-500 text-yellow-400 font-semibold text-sm cursor-pointer">
                  <Image size={16} /> {t('gallery')}
                  <input type="file" accept="image/*" className="hidden" onChange={handleScanFile} />
                </label>
              </div>
            </div>

            {/* AI elemzés */}
            <button onClick={getAiAnalysis} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary/10 border border-primary/30 text-primary text-sm font-medium">
              {aiLoading ? <Loader2 size={15} className="animate-spin" /> : <Bot size={15} />}
              {t('ai_financial_analysis')}
            </button>
            {aiAnalysis && (
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
                <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{aiAnalysis}</p>
              </div>
            )}

            <button onClick={() => setShowAdd(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-primary/40 text-primary text-sm font-medium">
              <Plus size={15} /> {t('add_manual_entry')}
            </button>
          </div>
        )}

        {tab === 'tetelek' && (
          <div className="space-y-2">
            <button onClick={() => setShowAdd(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold mb-3">
              <Plus size={15} /> {t('new_entry')}
            </button>
            {entries.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">{t('no_entries')}</p>}
            {entries.map(entry => (
              <div key={entry.id} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${entry.type === 'income' ? 'bg-primary/10' : 'bg-red-500/10'}`}>
                  {entry.type === 'income' ? <TrendingUp size={16} className="text-primary" /> : <TrendingDown size={16} className="text-red-400" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{entry.description}</p>
                  <p className="text-xs text-muted-foreground">{entry.date} · {entry.category === 'ceges' ? t('business') : t('personal')}</p>
                </div>
                <div className="text-right">
                  <SensitiveValue
                    className={`text-sm font-bold ${entry.type === 'income' ? 'text-primary' : 'text-red-400'}`}
                    maskedValue={maskCurrency(entry.amount || 0)}
                  >
                    {entry.type === 'income' ? '+' : '-'}£{(entry.amount||0).toFixed(2)}
                  </SensitiveValue>
                  <button onClick={() => deleteEntry(entry.id)} className="text-muted-foreground/50 hover:text-destructive"><X size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-end">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-semibold text-foreground">{t('new_entry')}</h2>
                <button onClick={() => setShowAdd(false)}><X size={18} className="text-muted-foreground" /></button>
              </div>
              <div className="space-y-3">
                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground" placeholder={t('description')} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground" placeholder={t('amount')} type="number" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))} />
                <div className="grid grid-cols-2 gap-2">
                  {[['income',t('income')],['expense',t('expense')]].map(([v,l]) => (
                    <button key={v} onClick={() => setForm(f=>({...f,type:v}))} className={`py-2 rounded-xl text-sm font-medium ${form.type===v?'bg-primary text-primary-foreground':'bg-secondary text-muted-foreground'}`}>{l}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[['ceges',t('business')],['magan',t('personal')]].map(([v,l]) => (
                    <button key={v} onClick={() => setForm(f=>({...f,category:v}))} className={`py-2 rounded-xl text-sm font-medium ${form.category===v?'bg-primary text-primary-foreground':'bg-secondary text-muted-foreground'}`}>{l}</button>
                  ))}
                </div>
                <input type="date" className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground" value={form.date} onChange={e => setForm(f=>({...f,date:e.target.value}))} />
                <button onClick={save} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold">{t('save')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}