import { useEffect, useMemo, useState } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { Loader2, Sparkles, ShieldAlert } from 'lucide-react';
import FeedbackCard from '@/components/admin/FeedbackCard';
import PromptTuningCard from '@/components/admin/PromptTuningCard';

export default function AiFeedbackAdmin() {
  const [user, setUser] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [tunings, setTunings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const weakFeedback = useMemo(() => feedback.filter((item) => Number(item.rating) <= 2), [feedback]);

  const loadData = async () => {
    const me = await jarvis.auth.me();
    setUser(me);
    if (!['admin', 'owner'].includes(me?.role)) {
      setLoading(false);
      return;
    }
    const response = await jarvis.functions.invoke('getAiFeedbackAdminData', {});
    setFeedback(response.data?.feedback || []);
    setTunings(response.data?.tunings || []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const generatePromptSuggestion = async () => {
    if (!weakFeedback.length) return;
    setGenerating(true);
    const sample = weakFeedback.slice(0, 8).map((item, index) => (
      `${index + 1}. Felhasználó: ${item.user_message || 'n/a'}\nAI válasz: ${item.assistant_reply}\nÉrtékelés: ${item.rating}/5`
    )).join('\n\n');

    const response = await jarvis.functions.invoke('llmProxy', {
      model: 'gemini_3_flash',
      prompt: `Elemezd az alábbi gyengén értékelt AI válaszokat, és írj egy rövid, biztonságos rendszer-prompt finomhangolást magyarul.\n\nCsak JSON-t adj vissza ebben a formában: {"title":"...","reason":"...","instruction":"..."}\n\n${sample}`,
      response_json_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          reason: { type: 'string' },
          instruction: { type: 'string' }
        }
      }
    });

    const rawResult = response?.data?.result ?? response?.data ?? response ?? {};
    let result = rawResult;
    if (typeof rawResult === 'string') {
      try { result = JSON.parse(rawResult.replace(/```json|```/g, '').trim()); }
      catch { result = {}; }
    }
    const createdResponse = await jarvis.functions.invoke('createPromptTuning', {
      title: result.title || 'Automatikus prompt javaslat',
      reason: result.reason || 'Gyenge értékelések alapján generálva.',
      proposed_instruction: result.instruction || 'Válaszolj rövidebben, konkrétabban, és kérdezz vissza, ha hiányzik adat.',
      based_on_feedback_count: weakFeedback.length,
    });
    setTunings((prev) => [createdResponse.data?.created, ...prev].filter(Boolean));
    setGenerating(false);
  };

  const approveTuning = async (tuning) => {
    await jarvis.functions.invoke('updatePromptTuning', { id: tuning.id, status: 'active' });
    await loadData();
  };

  const rejectTuning = async (tuning) => {
    await jarvis.functions.invoke('updatePromptTuning', { id: tuning.id, status: 'rejected' });
    await loadData();
  };

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  if (!['admin', 'owner'].includes(user?.role)) {
    return (
      <div className="h-full p-4 flex items-center justify-center">
        <div className="rounded-3xl border border-border bg-card p-6 text-center space-y-3">
          <ShieldAlert className="mx-auto text-yellow-400" />
          <h2 className="font-semibold">Admin hozzáférés szükséges</h2>
          <p className="text-sm text-muted-foreground">Ezt a finomhangoló felületet csak admin láthatja.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5 bg-background">
      <div className="rounded-3xl border border-border bg-card p-5 space-y-3">
        <p className="text-xs font-semibold text-primary uppercase tracking-wider">AI Feedback Admin</p>
        <h1 className="text-2xl font-bold text-foreground">AI válaszok finomhangolása</h1>
        <p className="text-sm text-muted-foreground">A rendszer nem írja át automatikusan a kódját; gyenge értékelésekből prompt-javaslatot készít, amit admin hagy jóvá.</p>
        <button
          onClick={generatePromptSuggestion}
          disabled={generating || weakFeedback.length === 0}
          className="w-full rounded-2xl bg-primary text-primary-foreground py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          Automatikus prompt-javaslat készítése
        </button>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold text-foreground">Prompt javaslatok</h2>
        {tunings.length === 0 ? <p className="text-sm text-muted-foreground">Még nincs javaslat.</p> : tunings.map((tuning) => (
          <PromptTuningCard key={tuning.id} tuning={tuning} onApprove={approveTuning} onReject={rejectTuning} />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-foreground">Gyengén értékelt válaszok</h2>
        {weakFeedback.length === 0 ? <p className="text-sm text-muted-foreground">Még nincs gyenge értékelés.</p> : weakFeedback.map((item) => (
          <FeedbackCard key={item.id} feedback={item} />
        ))}
      </section>
    </div>
  );
}