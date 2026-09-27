import { useState, useEffect } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { invokeWithRetry } from '@/lib/llmGateway';
import { Mail, Loader2, Inbox, Trash2, Reply, Star, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '@/lib/i18n';
import PullToRefresh from '@/components/common/PullToRefresh';

const CONNECTOR_ID = 'gmail';

export default function GmailManager() {
  const { t, lang } = useLang();
  const [user, setUser] = useState(null);
  const [connected, setConnected] = useState(false);
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [selected, setSelected] = useState(null);

  const [errorMessage, setErrorMessage] = useState('');

  const fetchEmails = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await jarvis.functions.invoke('gmailFetch', {});
      const data = res?.data || {};
      setEmails(data.emails || []);
      setConnected(data.connected === true);
      if (data.configured === false) {
        setErrorMessage(lang === 'hu'
          ? 'A Gmail nincs konfigurálva ebben a helyi Jarvis buildben. Google OAuth kapcsolat szükséges.'
          : 'Gmail is not configured in this local Jarvis build. A Google OAuth connection is required.');
      }
    } catch {
      setConnected(false);
      setErrorMessage(t('gmail_load_error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    jarvis.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        const me = await jarvis.auth.me();
        setUser(me);
        await fetchEmails();
      } else {
        setLoading(false);
      }
    });
  }, []);

  const handleConnect = async () => {
    setErrorMessage('');
    try {
      const url = await jarvis.connectors.connectAppUser(CONNECTOR_ID);
      if (!url) throw new Error('GMAIL_OAUTH_NOT_CONFIGURED');
      const popup = window.open(url, '_blank');
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          fetchEmails();
        }
      }, 500);
    } catch {
      setConnected(false);
      setErrorMessage(lang === 'hu'
        ? 'A Gmail csatlakoztatásához előbb Google OAuth kliens-konfiguráció szükséges. Jarvis ezt most már nem jelzi tévesen működő funkciónak.'
        : 'Google OAuth client configuration is required before Gmail can be connected.');
    }
  };

  const analyzeWithAI = async () => {
    if (emails.length === 0) return;
    setAnalyzing(true);
    const emailSummary = emails.slice(0, 10).map(e => `- Feladó: ${e.from} | Tárgy: ${e.subject} | Előnézet: ${e.snippet}`).join('\n');
    const result = await invokeWithRetry({
      prompt: `Elemezd ezeket az emaileket és kategorizáld őket. 
      
Emailek:
${emailSummary}

Adj vissza JSON-t:
{
  "urgent": ["fontos emailek listája"],
  "spam_likely": ["spam gyanús emailek"],
  "auto_reply_candidates": ["amire röviden válaszolható"],
  "summary": "rövid összefoglaló magyarul"
}`,
      response_json_schema: {
        type: 'object',
        properties: {
          urgent: { type: 'array', items: { type: 'string' } },
          spam_likely: { type: 'array', items: { type: 'string' } },
          auto_reply_candidates: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' }
        }
      },
    });
    const resultPayload = result?.data?.result ?? result?.data ?? result;
    const parsed = typeof resultPayload === 'string' ? JSON.parse(resultPayload) : resultPayload;
    setAnalysis(parsed);
    setAnalyzing(false);
  };

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center p-6">
          <Mail size={40} className="mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-sm text-muted-foreground mb-4">{t('gmail_login_required')}</p>
          <button onClick={() => jarvis.auth.redirectToLogin()} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
            {t('gmail_login_button')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <PullToRefresh onRefresh={fetchEmails}>
      <div className="px-4 pt-5 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-red-500/20 flex items-center justify-center">
            <Mail size={20} className="text-red-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">{t('page_gmail')}</h1>
            <p className="text-xs text-muted-foreground">{t('gmail_subtitle')}</p>
          </div>
          {connected && (
            <button onClick={fetchEmails} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <RefreshCw size={14} className="text-muted-foreground" />
            </button>
          )}
        </div>

        {!connected ? (
          <div className="bg-card border border-border rounded-2xl p-6 text-center">
            <Mail size={40} className="mx-auto text-red-400/50 mb-4" />
            <h2 className="text-base font-semibold text-foreground mb-2">{t('gmail_connect_title')}</h2>
            <p className="text-xs text-muted-foreground mb-5">{t('gmail_connect_desc')}</p>
            <button onClick={handleConnect} className="w-full py-3 rounded-2xl bg-red-500 text-white font-semibold text-sm">
              📧 {t('gmail_connect_button')}
            </button>
          </div>
        ) : (
          <>
            {/* AI Analysis */}
            <button
              onClick={analyzeWithAI}
              disabled={analyzing || emails.length === 0}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold text-sm mb-4 disabled:opacity-60"
            >
              {analyzing ? <Loader2 size={15} className="animate-spin" /> : '🤖'}
              {analyzing ? t('gmail_ai_loading') : t('gmail_ai_button')}
            </button>

            {/* Analysis Result */}
            <AnimatePresence>
              {analysis && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-primary/30 rounded-2xl p-4 mb-4 space-y-3">
                  <p className="text-xs font-semibold text-primary">🤖 {t('gmail_ai_result_title')}</p>
                  <p className="text-xs text-foreground">{analysis.summary}</p>
                  {analysis.urgent?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-red-400 mb-1">🔴 Sürgős</p>
                      {analysis.urgent.map((u, i) => <p key={i} className="text-xs text-foreground">• {u}</p>)}
                    </div>
                  )}
                  {analysis.spam_likely?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">🗑️ Spam gyanús</p>
                      {analysis.spam_likely.map((s, i) => <p key={i} className="text-xs text-muted-foreground line-through">• {s}</p>)}
                    </div>
                  )}
                  {analysis.auto_reply_candidates?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-primary mb-1">✉️ Automatikusan megválaszolható</p>
                      {analysis.auto_reply_candidates.map((r, i) => <p key={i} className="text-xs text-foreground">• {r}</p>)}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {errorMessage && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 mb-4 text-sm text-red-400">
                {errorMessage}
              </div>
            )}

            {/* Email list */}
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 size={24} className="text-primary animate-spin" /></div>
            ) : emails.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Inbox size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">{t('gmail_empty')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {emails.map((email, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setSelected(selected === i ? null : i)}
                    className={`bg-card border rounded-2xl p-4 cursor-pointer transition-all ${selected === i ? 'border-primary/40' : 'border-border'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 text-sm">
                        {email.from?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{email.from || 'Ismeretlen'}</p>
                        <p className="text-xs text-foreground truncate">{email.subject || '(tárgy nélkül)'}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{email.snippet}</p>
                      </div>
                      {email.unread && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />}
                    </div>

                    <AnimatePresence>
                      {selected === i && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden mt-3 pt-3 border-t border-border">
                          <p className="text-xs text-foreground whitespace-pre-wrap">{email.body || email.snippet}</p>
                          <div className="flex gap-2 mt-3">
                            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-medium">
                              <Reply size={12} /> {lang === 'hu' ? 'Válasz' : 'Reply'}
                            </button>
                            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary text-muted-foreground text-xs">
                              <Star size={12} /> {lang === 'hu' ? 'Csillag' : 'Star'}
                            </button>
                            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 text-red-400 text-xs">
                              <Trash2 size={12} /> {lang === 'hu' ? 'Törlés' : 'Delete'}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      </PullToRefresh>
    </div>
  );
}