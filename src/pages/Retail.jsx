import { useState, useEffect, useRef } from 'react';
import TutorialOverlay from '@/components/tutorial/TutorialOverlay';
import { jarvis } from '@/api/jarvisClient';
import { invokeWithRetry } from '@/lib/llmGateway';
import normalizeAssistantReply from '@/lib/normalizeAssistantReply';
import { X, Loader2 } from 'lucide-react';
import MobileSelect from '@/components/common/MobileSelect';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '@/lib/i18n';
import RetailHeader from '@/components/retail/RetailHeader';
import RetailKpiRow from '@/components/retail/RetailKpiRow';
import RetailTabs from '@/components/retail/RetailTabs';
import RetailInventoryTab from '@/components/retail/RetailInventoryTab';
import RetailSalesTab from '@/components/retail/RetailSalesTab';
import RetailInsightsTab from '@/components/retail/RetailInsightsTab';
import RetailStockMovementPanel from '@/components/retail/RetailStockMovementPanel';
import RetailRestockTab from '@/components/retail/RetailRestockTab';
import RetailStocktakeTab from '@/components/retail/RetailStocktakeTab';
import { localDateKey } from '@/lib/localDate';

const today = () => localDateKey();

export default function Retail() {
  const { t } = useLang();
  const [tab, setTab] = useState('inventory'); // inventory | stocktake | restock | sales | insights
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [savingSale, setSavingSale] = useState(false);
  const saleInFlight = useRef(false);
  const saleAttempt = useRef(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showSale, setShowSale] = useState(false);
  const [search, setSearch] = useState('');
  const [aiInsight, setAiInsight] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [prodForm, setProdForm] = useState({ name: '', sku: '', price: '', cost: '', stock: '', category: '', min_stock: '', business_id:'' });
  const [saleForm, setSaleForm] = useState({ product_id: '', quantity: '1', discount: '0' });
  const [barcode, setBarcode] = useState('');
  const [movementQty, setMovementQty] = useState('1');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const user = await jarvis.auth.me();
      if (!user?.email) throw new Error('auth_required');
      const [p, s, b] = await Promise.all([
        jarvis.entities.RetailProduct?.filter({ created_by: user.email }, '-created_date') || [],
        jarvis.entities.RetailSale.filter({ created_by: user.email }, '-created_date'),
        jarvis.entities.Business.filter({ created_by:user.email }),
      ]);
      setProducts(p);
      setSales(s);
      setBusinesses(b);
    } catch {
      setErrorMessage(t('retail_load_error'));
    } finally {
      setLoading(false);
    }
  };

  const addProduct = async () => {
    if (!prodForm.name.trim()) return;
    try {
    const created = await jarvis.entities.RetailProduct.create({
      ...prodForm,
      business_id:prodForm.business_id || null,
      price: Number(prodForm.price),
      cost: Number(prodForm.cost || 0),
      stock: Number(prodForm.stock || 0),
      min_stock: Number(prodForm.min_stock || 5),
    });
    setProducts(prev => [created, ...prev]);
    setProdForm({ name: '', sku: '', price: '', cost: '', stock: '', category: '', min_stock: '', business_id:'' });
    setShowAdd(false);
    } catch { setErrorMessage('A termék nem menthető. Ellenőrizd az árat és az egész darabszámokat.'); }
  };

  const recordSale = async () => {
    if (!saleForm.product_id || saleInFlight.current) return;
    saleInFlight.current = true;
    setSavingSale(true);
    setErrorMessage('');
    const request = saleAttempt.current || { ...saleForm, operation_id:crypto.randomUUID(), date:today() };
    saleAttempt.current = request;
    try {
    const result = await jarvis.retail.recordSale(request);
    if (result?.success !== true) throw new Error('SALE_NOT_CONFIRMED');
    saleAttempt.current = null;
    setShowSale(false);
    setSaleForm({ product_id: '', quantity: '1', discount: '0' });
    await load();
    } catch (error) {
      const reason = String(error?.message || '');
      if (/INVALID|PRECISION|INSUFFICIENT_STOCK|NOT_FOUND|TOO_LARGE/.test(reason)) saleAttempt.current = null;
      setErrorMessage(reason.includes('INSUFFICIENT_STOCK') ? 'Nincs elegendő készlet. Az eladás nem lett rögzítve.'
        : 'Az eladás mentése nem igazolt. Ellenőrizd az adatokat, majd próbáld újra; az újrapróbálás ugyanazt a műveletet használja.');
    } finally { saleInFlight.current = false; setSavingSale(false); }
  };

  const voidSale = async (sale) => {
    if (!window.confirm('Rögzíted a visszáru teljes visszatérítését és a termék készletre vételét?')) return;
    try {
      const result = await jarvis.retail.voidSale({ sale_id:sale.id, operation_id:crypto.randomUUID(), date:today() });
      if (result?.success !== true) throw new Error('RETURN_NOT_CONFIRMED');
      await load();
    } catch { setErrorMessage('A visszáru rögzítése nem sikerült. Frissítsd az eladáslistát az újrapróbálás előtt.'); }
  };

  const matchedProduct = products.find((p) => {
    const code = barcode.trim().toLowerCase();
    return code && (p.sku?.toLowerCase() === code || p.name?.toLowerCase() === code);
  });

  const updateStockByBarcode = async (direction) => {
    if (!matchedProduct) return;
    try {
    const result = await jarvis.retail.adjustStock({ product_id:matchedProduct.id, quantity:Number(movementQty), direction, operation_id:crypto.randomUUID() });
    if (result?.success !== true) throw new Error('STOCK_NOT_CONFIRMED');
    setBarcode('');
    setMovementQty('1');
    await load();
    } catch { setErrorMessage('A készletmozgás nem menthető. Ellenőrizd a darabszámot és a rendelkezésre álló készletet.'); }
  };

  const updatePhysicalStock = async (productId, stock) => {
    const product = products.find(item => item.id === productId);
    try {
    const result = await jarvis.retail.adjustStock({ product_id:productId, stock, expected_stock:product?.stock, operation_id:crypto.randomUUID() });
    if (result?.success !== true) throw new Error('STOCK_NOT_CONFIRMED');
    setProducts((prev) => prev.map((item) => (item.id === productId ? { ...item, stock } : item)));
    } catch { await load(); setErrorMessage('A készlet időközben változott vagy érvénytelen. Frissítsd a listát és ismételd meg a leltárt.'); }
  };

  const getAiInsight = async () => {
    setAiLoading(true);
    const totalRevenue = sales.filter(sale => sale.status !== 'voided').reduce((s, sale) => s + (sale.revenue || 0), 0);
    const totalProfit = sales.filter(sale => sale.status !== 'voided').reduce((s, sale) => s + (sale.profit || 0), 0);
    const lowStock = products.filter(p => (p.stock || 0) <= (p.min_stock || 5));
    const topProduct = sales.filter(sale => sale.status !== 'voided').reduce((acc, sale) => {
      acc[sale.product_name] = (acc[sale.product_name] || 0) + sale.revenue;
      return acc;
    }, {});
    const topName = Object.entries(topProduct).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    const prompt = `Te egy kiskereskedelmi AI elemző vagy. Elemezd ezeket az adatokat és adj 3-4 konkrét, actionable tanácsot magyarul:

Termékek: ${products.length} db | Alacsony készlet: ${lowStock.map(p => p.name).join(', ') || 'nincs'}
Értékesítések (${sales.length} tranzakció): Bevétel: £${totalRevenue.toFixed(0)} | Profit: £${totalProfit.toFixed(0)} | Margin: ${totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}%
Top termék: ${topName}

Adj rövid, döntésre kész elemzést. Legyél specifikus.`;

    try {
      const res = await invokeWithRetry({ prompt });
      setAiInsight(normalizeAssistantReply(res));
    } catch {
      setAiInsight('Az AI-elemzés most nem sikerült. Próbáld újra.');
    } finally {
      setAiLoading(false);
    }
  };

  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const totalRevenue = sales.filter(sale => sale.status !== 'voided').reduce((s, sale) => s + (sale.revenue || 0), 0);
  const totalProfit = sales.filter(sale => sale.status !== 'voided').reduce((s, sale) => s + (sale.profit || 0), 0);
  const lowStock = products.filter(p => (p.stock || 0) <= (p.min_stock || 5));
  const todaySales = sales.filter(s => s.date === today() && s.status !== 'voided');

  const retailTutorial = [
    {
      icon: '🛒',
      title: 'Retail Management',
      description: 'Készletgazdálkodás, értékesítési nyomon követés, teljesítményelemzés.',
      hint: 'Minden termékhez ár, költség és minimális készlet szint',
    },
    {
      icon: '📦',
      title: 'Készlet és eladások',
      description: 'Rögzítsd a termékeket, majd az eladásokat a pénzügyi áttekintéshez.',
      hint: 'Az AI automatikusan kiszámítja a nyereséget és az áremarginot',
    },
    {
      icon: '💹',
      title: 'Üzleti insights',
      description: 'Az AI heti elemzéseket és javaslatokat ad az értékesítésre.',
      hint: 'Nyomd meg az "🤖 AI Elemzés" fület',
    },
  ];

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <TutorialOverlay tutorialId="retail-intro" steps={retailTutorial} />
      {/* Header */}
      <div className="px-4 pt-5 pb-3 shrink-0">
        <RetailHeader
          productsCount={products.length}
          todayRevenue={todaySales.reduce((s, x) => s + (x.revenue || 0), 0)}
          onAddSale={() => setShowSale(true)}
          onAddProduct={() => setShowAdd(true)}
        />
        <RetailKpiRow totalRevenue={totalRevenue} totalProfit={totalProfit} lowStockCount={lowStock.length} />
        <RetailTabs tab={tab} setTab={setTab} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {errorMessage && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 mb-4 text-sm text-red-400">
            {errorMessage}
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="text-primary animate-spin" /></div>
        ) : (
          <>
            {tab === 'inventory' && (
              <>
                <RetailStockMovementPanel
                  barcode={barcode}
                  setBarcode={setBarcode}
                  quantity={movementQty}
                  setQuantity={setMovementQty}
                  matchedProduct={matchedProduct}
                  onStockIn={() => updateStockByBarcode('in')}
                  onStockOut={() => updateStockByBarcode('out')}
                />
                <RetailInventoryTab lowStock={lowStock} search={search} setSearch={setSearch} filtered={filtered} />
              </>
            )}

            {tab === 'stocktake' && (
              <RetailStocktakeTab
                products={products}
                onUpdateStock={updatePhysicalStock}
              />
            )}

            {tab === 'restock' && <RetailRestockTab products={products} />}

            {tab === 'sales' && <RetailSalesTab sales={sales} onVoid={voidSale} />}

            {tab === 'insights' && (
              <RetailInsightsTab
                aiLoading={aiLoading}
                productsCount={products.length}
                aiInsight={aiInsight}
                onGenerate={getAiInsight}
              />
            )}
          </>
        )}
      </div>

      {/* Add Product Modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-end">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-semibold text-foreground">Új termék</h2>
                <button onClick={() => setShowAdd(false)}><X size={18} className="text-muted-foreground" /></button>
              </div>
              <div className="space-y-3">
                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
                  placeholder="Termék neve *" value={prodForm.name} onChange={e => setProdForm(f => ({ ...f, name: e.target.value }))} />
                <MobileSelect value={prodForm.business_id} onChange={v => setProdForm(f => ({ ...f, business_id:v }))}
                  options={[{ value:'', label:'Céges – vállalkozáshoz még nincs rendelve' }, ...businesses.map(b => ({ value:b.id, label:b.name }))]}
                  placeholder="Vállalkozás" />
                <div className="grid grid-cols-2 gap-2">
                  <input className="bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-border text-foreground"
                    placeholder="Barcode / SKU" value={prodForm.sku} onChange={e => setProdForm(f => ({ ...f, sku: e.target.value }))} />
                  <input className="bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-border text-foreground"
                    placeholder="Kategória" value={prodForm.category} onChange={e => setProdForm(f => ({ ...f, category: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className="bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-border text-foreground"
                    type="number" placeholder="Eladási ár £" value={prodForm.price} onChange={e => setProdForm(f => ({ ...f, price: e.target.value }))} />
                  <input className="bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-border text-foreground"
                    type="number" placeholder="Önköltség £" value={prodForm.cost} onChange={e => setProdForm(f => ({ ...f, cost: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className="bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-border text-foreground"
                    type="number" placeholder="Készlet (db)" value={prodForm.stock} onChange={e => setProdForm(f => ({ ...f, stock: e.target.value }))} />
                  <input className="bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-border text-foreground"
                    type="number" placeholder="Min. készlet" value={prodForm.min_stock} onChange={e => setProdForm(f => ({ ...f, min_stock: e.target.value }))} />
                </div>
                <button onClick={addProduct} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm">
                  Termék hozzáadása
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Record Sale Modal */}
      <AnimatePresence>
        {showSale && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-end">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-semibold text-foreground">Eladás rögzítése</h2>
                <button onClick={() => setShowSale(false)}><X size={18} className="text-muted-foreground" /></button>
              </div>
              <div className="space-y-3">
                <MobileSelect
                  value={saleForm.product_id}
                  onChange={v => setSaleForm(f => ({ ...f, product_id: v }))}
                  options={products.map(p => ({ value: p.id, label: `${p.name} – £${p.price} (${p.stock} db)` }))}
                  placeholder="Válassz terméket..."
                />
                <div className="grid grid-cols-2 gap-2">
                  <input className="bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-border text-foreground"
                    type="number" min="1" placeholder="Mennyiség" value={saleForm.quantity}
                    onChange={e => setSaleForm(f => ({ ...f, quantity: e.target.value }))} />
                  <input className="bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-border text-foreground"
                    type="number" min="0" max="100" placeholder="Kedvezmény %" value={saleForm.discount}
                    onChange={e => setSaleForm(f => ({ ...f, discount: e.target.value }))} />
                </div>
                {saleForm.product_id && (
                  <div className="bg-secondary rounded-xl p-3 text-xs text-muted-foreground">
                    {(() => {
                      const p = products.find(x => x.id === saleForm.product_id);
                      const qty = parseInt(saleForm.quantity) || 1;
                      const disc = parseFloat(saleForm.discount) || 0;
                      const rev = p ? p.price * qty * (1 - disc / 100) : 0;
                      const profit = p ? rev - p.cost * qty : 0;
                      return `Bevétel: £${rev.toFixed(2)} | Profit: £${profit.toFixed(2)}`;
                    })()}
                  </div>
                )}
                <button onClick={recordSale} disabled={!saleForm.product_id || savingSale}
                  className="w-full py-3 rounded-2xl bg-orange-500 text-white font-semibold text-sm disabled:opacity-50">
                  {savingSale ? 'Mentés…' : 'Kifizetett eladás rögzítése'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
