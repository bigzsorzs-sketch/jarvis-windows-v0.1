import { useState, useEffect } from 'react';
import { invokeWithRetry } from '@/lib/llmGateway';
import { jarvis } from '@/api/jarvisClient';
import { Plus, Check, X, ChevronDown, ChevronUp, Loader2, Bot, Sparkles, Clock, CheckCircle2, XCircle, Rocket, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const categoryColors = {
  ui: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'UI / Dizájn' },
  ai: { bg: 'bg-purple-500/15', text: 'text-purple-400', label: 'AI / Intelligencia' },
  tools: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'Eszközök' },
  performance: { bg: 'bg-orange-500/15', text: 'text-orange-400', label: 'Teljesítmény' },
  feature: { bg: 'bg-primary/15', text: 'text-primary', label: 'Új funkció' },
};

const priorityColors = {
  low: 'text-muted-foreground',
  medium: 'text-yellow-400',
  high: 'text-red-400',
};

const statusConfig = {
  pending: { icon: Clock, color: 'text-yellow-400', label: 'Várakozik', bg: 'bg-yellow-400/10' },
  approved: { icon: CheckCircle2, color: 'text-primary', label: 'Jóváhagyva', bg: 'bg-primary/10' },
  rejected: { icon: XCircle, color: 'text-red-400', label: 'Elutasítva', bg: 'bg-red-400/10' },
  implemented: { icon: Rocket, color: 'text-blue-400', label: 'Implementálva', bg: 'bg-blue-400/10' },
};

export default function UpgradeCenter() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [userNotes, setUserNotes] = useState({});
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({ title: '', description: '', category: 'feature', priority: 'medium' });
  const [showImplementModal, setShowImplementModal] = useState(false);
  const [implementMessage, setImplementMessage] = useState('');

  useEffect(() => {
    loadProposals();
  }, []);

  const loadProposals = async () => {
    setLoading(true);
    const currentUser = await jarvis.auth.me().catch(() => null);
    const list = currentUser?.email
      ? await jarvis.entities.UpgradeProposal.filter({ created_by: currentUser.email }, '-created_date') // user-owned explicit owner filter
      : [];
    setProposals(list);
    setLoading(false);
  };

  const generateAIProposals = async () => {
    setGenerating(true);
    const result = await invokeWithRetry({
      prompt: `Te egy magyar AI személyes asszisztens app fejlesztője vagy. Az app tartalmaz: Chat (AI beszélgetés hangbemenettel), Műszerfal (pénzügy/vércukor/teendő grafikonok), Memória (AI memória kezelés), Eszközök (Pénzügy, Számlák, Naptár, Fordító, Vércukor, Gyógyszer, Étkezés), Beállítások.

Generálj 3 konkrét, értékes upgrade javaslatot JSON tömbként:
[
  {
    "title": "...",
    "description": "...",
    "category": "ui|ai|tools|performance|feature",
    "priority": "low|medium|high",
    "ai_reasoning": "Miért hasznos ez a fejlesztés...",
    "implementation_plan": "Hogyan lehet implementálni lépésről lépésre..."
  }
]
Csak a JSON tömböt add vissza, semmi más.`,
    });
    try {
      const rawResult = result?.data?.result ?? result?.data ?? result;
      const jsonStr = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
      const parsed = JSON.parse(jsonStr.replace(/```json|```/g, '').trim());
      for (const proposal of parsed) {
        const currentUser = await jarvis.auth.me().catch(() => null);
        const created = await jarvis.entities.UpgradeProposal.create({ ...proposal, status: 'pending', created_by: currentUser?.email });
        setProposals(prev => [created, ...prev]);
      }
    } catch (e) {
      console.error('Parse error', e);
    }
    setGenerating(false);
  };

  const updateStatus = async (id, status) => {
    const proposal = proposals.find(p => p.id === id);
    await jarvis.entities.UpgradeProposal.update(id, { status, user_notes: userNotes[id] || '' });
    setProposals(prev => prev.map(p => p.id === id ? { ...p, status, user_notes: userNotes[id] || '' } : p));

    // Ha jóváhagyták → automatikusan létrehoz egy Conversation üzenetet az AI-nak implementálásra
    if (status === 'approved' && proposal) {
      const implementMsg = `🚀 UPGRADE JÓVÁHAGYVA – KÉREM AZ IMPLEMENTÁCIÓT\n\n**${proposal.title}**\n\n${proposal.description}\n\n📋 Implementációs terv:\n${proposal.implementation_plan || 'Nincs részletes terv, az AI döntse el a legjobb megközelítést.'}\n\n${userNotes[id] ? `💬 Megjegyzésem: ${userNotes[id]}\n\n` : ''}⚡ Kérlek implementáld ezt a fejlesztést az appba most!`;
      await jarvis.entities.Conversation.create({
        title: `✅ Jóváhagyott upgrade: ${proposal.title}`,
        messages: [
          {
            role: 'user',
            content: implementMsg,
            timestamp: new Date().toISOString(),
          }
        ],
        is_archived: false,
      });
      setImplementMessage(implementMsg);
      setShowImplementModal(true);
    }
  };

  const deleteProposal = async (id) => {
    await jarvis.entities.UpgradeProposal.delete(id);
    setProposals(prev => prev.filter(p => p.id !== id));
  };

  const submitNew = async () => {
    if (!form.title.trim()) return;
    const currentUser = await jarvis.auth.me().catch(() => null);
    const created = await jarvis.entities.UpgradeProposal.create({ ...form, status: 'pending', created_by: currentUser?.email });
    setProposals(prev => [created, ...prev]);
    setForm({ title: '', description: '', category: 'feature', priority: 'medium' });
    setShowNewForm(false);
  };

  const filtered = filter === 'all' ? proposals : proposals.filter(p => p.status === filter);

  const counts = {
    all: proposals.length,
    pending: proposals.filter(p => p.status === 'pending').length,
    approved: proposals.filter(p => p.status === 'approved').length,
    implemented: proposals.filter(p => p.status === 'implemented').length,
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="px-4 pt-5 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center">
            <Sparkles size={20} className="text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">Upgrade Center</h1>
            <p className="text-xs text-muted-foreground">AI javaslatok – te döntesz, mi implementáljuk</p>
          </div>
        </div>

        {/* Hogyan működik banner */}
        <div className="bg-card border border-primary/30 rounded-2xl p-4 mb-4">
          <p className="text-xs font-semibold text-primary mb-2">⚡ Hogyan működik?</p>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p>1. Az AI javaslatokat generál az appod fejlesztéséhez</p>
            <p>2. Te jóváhagyod amit szeretnél</p>
            <p>3. A jóváhagyás után <span className="text-foreground font-medium">másold be az üzenetet a Chat oldalon</span> – én azonnal implementálom a kódot</p>
          </div>
        </div>

        {/* AI generálás gomb */}
        <button
          onClick={generateAIProposals}
          disabled={generating}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold text-sm mb-4 disabled:opacity-70"
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}
          {generating ? 'AI elemzi az appot és javaslatokat generál...' : '✨ AI Upgrade javaslatok generálása'}
        </button>

        {/* Saját javaslat */}
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-border bg-card text-foreground text-sm font-medium mb-4"
        >
          <Plus size={15} /> Saját javaslat hozzáadása
        </button>

        {/* New form */}
        <AnimatePresence>
          {showNewForm && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-4">
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <input
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
                  placeholder="Javaslat neve..."
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
                <textarea
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground resize-none"
                  rows={3}
                  placeholder="Részletes leírás..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground"
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  >
                    {Object.entries(categoryColors).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <select
                    className="bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground"
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  >
                    <option value="low">Alacsony</option>
                    <option value="medium">Közepes</option>
                    <option value="high">Magas</option>
                  </select>
                </div>
                <button onClick={submitNew} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                  Beküldés
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {[
            { key: 'all', label: `Összes (${counts.all})` },
            { key: 'pending', label: `⏳ Várakozik (${counts.pending})` },
            { key: 'approved', label: `✅ Jóváhagyva (${counts.approved})` },
            { key: 'implemented', label: `🚀 Kész (${counts.implemented})` },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${filter === key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Proposals */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="text-primary animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Sparkles size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Még nincsenek javaslatok.</p>
            <p className="text-xs mt-1">Kattints az AI generálás gombra!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(proposal => {
              const cat = categoryColors[proposal.category] || categoryColors.feature;
              const status = statusConfig[proposal.status] || statusConfig.pending;
              const StatusIcon = status.icon;
              const isExpanded = expandedId === proposal.id;

              return (
                <motion.div key={proposal.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border rounded-2xl overflow-hidden">
                  {/* Header row */}
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 px-2 py-0.5 rounded-full ${cat.bg} shrink-0`}>
                        <span className={`text-xs font-medium ${cat.text}`}>{cat.label}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-tight">{proposal.title}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{proposal.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${status.bg}`}>
                        <StatusIcon size={12} className={status.color} />
                        <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
                      </div>
                      <button onClick={() => setExpandedId(isExpanded ? null : proposal.id)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        Részletek {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                        className="overflow-hidden border-t border-border">
                        <div className="p-4 space-y-3">
                          {proposal.ai_reasoning && (
                            <div className="bg-secondary rounded-xl p-3">
                              <p className="text-xs font-semibold text-muted-foreground mb-1">🤖 AI indoklás</p>
                              <p className="text-xs text-foreground leading-relaxed">{proposal.ai_reasoning}</p>
                            </div>
                          )}
                          {proposal.implementation_plan && (
                            <div className="bg-secondary rounded-xl p-3">
                              <p className="text-xs font-semibold text-muted-foreground mb-1">📋 Implementációs terv</p>
                              <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{proposal.implementation_plan}</p>
                            </div>
                          )}

                          {/* User notes */}
                          {proposal.status === 'pending' && (
                            <textarea
                              className="w-full bg-secondary rounded-xl px-3 py-2.5 text-xs outline-none border border-border text-foreground resize-none"
                              rows={2}
                              placeholder="Megjegyzés (opcionális)..."
                              value={userNotes[proposal.id] || proposal.user_notes || ''}
                              onChange={e => setUserNotes(n => ({ ...n, [proposal.id]: e.target.value }))}
                            />
                          )}
                          {proposal.user_notes && proposal.status !== 'pending' && (
                            <div className="bg-secondary rounded-xl p-3">
                              <p className="text-xs font-semibold text-muted-foreground mb-1">💬 Megjegyzésed</p>
                              <p className="text-xs text-foreground">{proposal.user_notes}</p>
                            </div>
                          )}

                          {/* Action buttons */}
                          {proposal.status === 'pending' && (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => updateStatus(proposal.id, 'approved')}
                                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
                              >
                                <Check size={15} /> Jóváhagyom
                              </button>
                              <button
                                onClick={() => updateStatus(proposal.id, 'rejected')}
                                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-secondary border border-border text-muted-foreground text-sm font-medium"
                              >
                                <X size={15} /> Elutasítom
                              </button>
                            </div>
                          )}

                          {proposal.status === 'approved' && (
                            <div className="space-y-2">
                              <div className="bg-primary/10 rounded-xl p-3 space-y-2">
                                <p className="text-xs font-semibold text-primary">✅ Jóváhagyva! Következő lépés:</p>
                                <p className="text-xs text-foreground">Menj a <strong>Chat</strong> oldalra, és küldd el ezt az üzenetet – én azonnal implementálom:</p>
                                <div className="bg-background rounded-lg p-2 text-xs text-muted-foreground font-mono break-all">
                                  🚀 UPGRADE: {proposal.title} – kérem az implementációt!
                                </div>
                                <button
                                  onClick={() => { navigator.clipboard.writeText(`🚀 UPGRADE JÓVÁHAGYVA: "${proposal.title}"\n\n${proposal.description}\n\n${proposal.implementation_plan ? `Implementációs terv: ${proposal.implementation_plan}` : ''}\n\nKérlek implementáld ezt most az appba!`); }}
                                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                                >
                                  <Copy size={12} /> Üzenet másolása vágólapra
                                </button>
                              </div>
                              <div className="w-full rounded-xl bg-blue-500/10 border border-blue-500/20 px-3 py-2.5 text-xs text-blue-300">
                                Az „Implementálva” állapotot nem lehet kézzel beállítani. Csak tényleges kódmódosítás és sikeres CI/release ellenőrzés után tekinthető késznek.
                              </div>
                            </div>
                          )}

                          {proposal.status === 'implemented' && (
                            <div className="flex items-center gap-2 bg-blue-500/10 rounded-xl p-3">
                              <Rocket size={14} className="text-blue-400 shrink-0" />
                              <p className="text-xs text-foreground">Ez a fejlesztés korábban implementáltként lett rögzítve. A tényleges kész állapotot mindig a release/CI eredmény igazolja.</p>
                            </div>
                          )}

                          {proposal.status === 'rejected' && (
                            <button
                              onClick={() => updateStatus(proposal.id, 'pending')}
                              className="w-full py-2 rounded-xl bg-secondary text-muted-foreground text-xs"
                            >
                              Visszaállítás függőbe
                            </button>
                          )}

                          <button onClick={() => deleteProposal(proposal.id)}
                            className="w-full py-2 rounded-xl text-xs text-red-400/70 hover:text-red-400">
                            Törlés
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Implement Modal – megjelenik jóváhagyás után */}
      <AnimatePresence>
        {showImplementModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-end">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center">
                  <Rocket size={20} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Jóváhagyva! 🎉</p>
                  <p className="text-xs text-muted-foreground">Másold be a Chat oldalon</p>
                </div>
              </div>
              <div className="bg-secondary rounded-xl p-3 mb-4 max-h-32 overflow-y-auto">
                <p className="text-xs text-foreground font-mono whitespace-pre-wrap">{implementMessage}</p>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(implementMessage); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm mb-2"
              >
                <Copy size={15} /> Másolás vágólapra
              </button>
              <button
                onClick={() => setShowImplementModal(false)}
                className="w-full py-2.5 rounded-2xl bg-secondary text-muted-foreground text-sm"
              >
                Bezárás
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}