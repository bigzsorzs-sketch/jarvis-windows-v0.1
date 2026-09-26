import { useState } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { Scale, Search, Loader2, ChevronDown, ChevronUp, BookOpen, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '@/lib/i18n';
import PullToRefresh from '@/components/common/PullToRefresh';

const QUICK_QUESTIONS = {
  hu: [
    'Mi a különbség a Kft. és Bt. között?',
    'Mikor kötelező az áfa felszámítása?',
    'Hogyan kell felmondani munkaviszályt?',
    'Mi a GDPR szerinti adatkezelési hozzájárulás?',
    'Mennyi a fizetési határidő alapértelmezetten?',
    'Mit jelent a kezesi felelősség?',
  ],
  en: [
    'What is the difference between a limited company and a partnership?',
    'When is VAT mandatory?',
    'How do you terminate an employment relationship?',
    'What is GDPR consent for data processing?',
    'What is the default payment deadline?',
    'What does guarantor liability mean?',
  ]
};

export default function Legal() {
  const { t, lang } = useLang();

  const LEGAL_TOPICS = [
    { id: 'contract', label: lang === 'hu' ? '📄 Szerződés' : lang === 'es' ? '📄 Contrato' : lang === 'de' ? '📄 Vertrag' : lang === 'fr' ? '📄 Contrat' : '📄 Contract', prompt: 'From a legal perspective, answer this question: ' },
    { id: 'employment', label: lang === 'hu' ? '👔 Munkajog' : lang === 'es' ? '👔 Derecho Laboral' : lang === 'de' ? '👔 Arbeitsrecht' : lang === 'fr' ? '👔 Droit du Travail' : '👔 Employment Law', prompt: 'From an employment law perspective: ' },
    { id: 'tax', label: lang === 'hu' ? '💰 Adózás' : lang === 'es' ? '💰 Impuestos' : lang === 'de' ? '💰 Steuerrecht' : lang === 'fr' ? '💰 Fiscalité' : '💰 Tax Law', prompt: 'From a tax law perspective: ' },
    { id: 'privacy', label: lang === 'hu' ? '🔒 GDPR / Adatvédelem' : '🔒 GDPR / Privacy', prompt: 'From a GDPR and data protection perspective: ' },
    { id: 'business', label: lang === 'hu' ? '🏢 Cégjog' : lang === 'es' ? '🏢 Derecho Mercantil' : lang === 'de' ? '🏢 Gesellschaftsrecht' : lang === 'fr' ? '🏢 Droit des Sociétés' : '🏢 Business Law', prompt: 'From a business law perspective: ' },
    { id: 'consumer', label: lang === 'hu' ? '🛒 Fogyasztóvédelem' : lang === 'es' ? '🛒 Defensa del Consumidor' : lang === 'de' ? '🛒 Verbraucherschutz' : lang === 'fr' ? '🛒 Protection des Consommateurs' : '🛒 Consumer Protection', prompt: 'From a consumer protection perspective: ' },
  ];

  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState(null);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const currentTopic = topic || LEGAL_TOPICS[0];

  const ask = async (q) => {
    const question = q || query;
    if (!question.trim()) return;
    setLoading(true);
    setResult('');

    const langInstruction = lang === 'hu' ? 'Válaszolj magyarul' : lang === 'es' ? 'Responde en español' : lang === 'de' ? 'Antworte auf Deutsch' : lang === 'fr' ? 'Réponds en français' : 'Respond in English';
    const prompt = `${currentTopic.prompt}${question}

${langInstruction}. Be clear and informative, NOT as legal advice (emphasize this), but as general information.
Structure:
1. Short summary (2-3 sentences)
2. Key points (list)
3. Important warnings
4. Recommended next step

Always end with: "⚠️ This is general information, not legal advice. For specific matters, consult a qualified lawyer."`;

    const response = await jarvis.functions.invoke('runAiTask', { prompt, model: 'claude_sonnet_4_6' });
    setResult(response.data?.result || '');
    setHistory(prev => [{ topic: currentTopic.label, question, answer: response.data?.result || '', date: new Date().toLocaleDateString() }, ...prev.slice(0, 9)]);
    setLoading(false);
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <PullToRefresh onRefresh={async () => {
        setResult('');
        setHistory([]);
      }}>
      <div className="px-4 pt-5 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center">
            <Scale size={20} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{lang === 'hu' ? 'Jogi Tudatosság' : lang === 'es' ? 'Conciencia Legal' : lang === 'de' ? 'Rechtsbewusstsein' : lang === 'fr' ? 'Conscience Juridique' : 'Legal Awareness'}</h1>
            <p className="text-xs text-muted-foreground">{lang === 'hu' ? 'Jogi tájékoztatás – nem tanácsadás' : lang === 'es' ? 'Información legal – no asesoramiento' : lang === 'de' ? 'Rechtliche Information – keine Beratung' : lang === 'fr' ? 'Information juridique – pas de conseil' : 'Legal information – not advice'}</p>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-3 mb-4 flex gap-2">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-300">{lang === 'hu' ? 'Ez a modul tájékoztatást nyújt, nem minősül jogi tanácsadásnak. Konkrét ügyekben mindig fordulj ügyvédhez.' : lang === 'es' ? 'Este módulo proporciona información, no constituye asesoramiento jurídico. Para casos concretos, consulta siempre a un abogado.' : lang === 'de' ? 'Dieses Modul bietet allgemeine Informationen, keine Rechtsberatung. Wende dich für konkrete Fälle an einen Anwalt.' : lang === 'fr' ? 'Ce module fournit des informations générales, pas des conseils juridiques. Pour des cas spécifiques, consultez toujours un avocat.' : 'This module provides general information, not legal advice. For specific matters, always consult a qualified lawyer.'}</p>
        </div>

        {/* Topic selector */}
        <div className="flex flex-wrap gap-2 mb-4">
          {LEGAL_TOPICS.map(tp => (
            <button key={tp.id} onClick={() => setTopic(tp)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${currentTopic.id === tp.id ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50' : 'bg-secondary text-muted-foreground'}`}>
              {tp.label}
            </button>
          ))}
        </div>

        {/* Quick questions */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2">{lang === 'hu' ? 'Gyors kérdések:' : lang === 'es' ? 'Preguntas rápidas:' : lang === 'de' ? 'Schnellfragen:' : lang === 'fr' ? 'Questions rapides:' : 'Quick questions:'}</p>
          <div className="flex flex-wrap gap-2">
            {(QUICK_QUESTIONS[lang] || QUICK_QUESTIONS.en).map(q => (
              <button key={q} onClick={() => { setQuery(q); ask(q); }}
                className="px-3 py-1.5 rounded-xl bg-card border border-border text-xs text-foreground hover:border-blue-500/50 transition-all">
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="bg-card border border-border rounded-2xl p-3 mb-4">
          <textarea
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none"
            rows={3}
            placeholder={`${lang === 'hu' ? 'Kérdezz a(z)' : lang === 'es' ? 'Pregunta sobre' : lang === 'de' ? 'Frage zu' : lang === 'fr' ? 'Posez une question sur' : 'Ask about'} ${currentTopic.label}...`}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), ask())}
          />
          <button onClick={() => ask()} disabled={!query.trim() || loading}
            className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? (lang === 'hu' ? 'Elemzés...' : lang === 'es' ? 'Analizando...' : lang === 'de' ? 'Analysieren...' : lang === 'fr' ? 'Analyse...' : 'Analyzing...') : (lang === 'hu' ? 'Jogi tájékoztatás kérése' : lang === 'es' ? 'Solicitar información legal' : lang === 'de' ? 'Rechtliche Information anfragen' : lang === 'fr' ? 'Demander une information juridique' : 'Request legal information')}
          </button>
        </div>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-blue-500/30 rounded-2xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen size={14} className="text-blue-400" />
                <p className="text-xs font-semibold text-blue-400">{currentTopic.label} – {lang === 'hu' ? 'Tájékoztatás' : lang === 'es' ? 'Información' : lang === 'de' ? 'Information' : lang === 'fr' ? 'Information' : 'Information'}</p>
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{result}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* History */}
        {history.length > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <button onClick={() => setShowHistory(s => !s)}
              className="w-full flex items-center gap-3 p-4">
              <BookOpen size={16} className="text-muted-foreground" />
              <span className="flex-1 text-sm font-medium text-foreground text-left">{lang === 'hu' ? 'Előzmények' : lang === 'es' ? 'Historial' : lang === 'de' ? 'Verlauf' : lang === 'fr' ? 'Historique' : 'History'} ({history.length})</span>
              {showHistory ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            <AnimatePresence>
              {showHistory && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                  className="overflow-hidden border-t border-border">
                  <div className="p-4 space-y-3">
                    {history.map((h, i) => (
                      <button key={i} onClick={() => setResult(h.answer)}
                        className="w-full text-left bg-secondary rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-blue-400 font-medium">{h.topic}</span>
                          <span className="text-xs text-muted-foreground">{h.date}</span>
                        </div>
                        <p className="text-xs text-foreground line-clamp-2">{h.question}</p>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
      </PullToRefresh>
    </div>
  );
}