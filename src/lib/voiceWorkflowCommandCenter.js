import { loadFullContext, buildSystemPrompt, parseActions, executeActions } from '@/lib/assistantTools';
import { invokeWithRetry } from '@/lib/llmGateway';

export function isComplexWorkflowIntent(text = '') {
  const lower = text.toLowerCase();
  const flowWords = ['egyszerre', 'egyidejűleg', 'workflow', 'folyamat', 'majd', 'aztán', 'plusz'];
  const domainWords = ['számla', 'naptár', 'értesítő', 'értesítés', 'emlékeztető', 'feladat', 'email'];
  return flowWords.some((word) => lower.includes(word)) && domainWords.filter((word) => lower.includes(word)).length >= 2;
}

export async function executeVoiceWorkflowCommand(transcript, { userMood = 'neutral' } = {}) {
  const text = transcript?.trim();
  if (!text || !isComplexWorkflowIntent(text)) return null;

  const ctx = await loadFullContext();
  const systemPrompt = `${buildSystemPrompt(ctx, 'Mindig magyarul válaszolj.', userMood)}

A felhasználó összetett hangparancsot adott több lépésből álló workflow futtatására.
- Ha elég adat van, bontsd szét a feladatot több műveletre.
- Kizárólag actions JSON blokkot használj.
- A műveletek sorrendje számít.
- Ha kritikus adat hiányzik, kérdezz vissza röviden magyarul.
- Ne találj ki hiányzó ügyfél-, számla- vagy időpont adatot.
`;

  const reply = await invokeWithRetry({
    prompt: `${systemPrompt}\n\nFelhasználó: ${text}\n\nAsszisztens:`,
    model: 'gemini_3_flash',
  });

  const parsedReply = typeof reply === 'string' ? reply : (reply?.result ?? reply?.data?.result ?? reply?.data ?? '');
  const actions = parseActions(parsedReply);

  if (actions.length === 0) {
    return { handled: true, reply: parsedReply, actionResults: [] };
  }

  const actionResults = await executeActions(actions);
  const visibleReply = parsedReply.replace(/```actions?[\s\S]*?```/gi, '').trim() || '✅ Az összetett hangparancs lefutott.';

  return {
    handled: true,
    reply: visibleReply,
    actionResults,
  };
}