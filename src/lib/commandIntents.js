import { getWorkflowSuggestions } from '@/lib/workflowEngine';
import { recognizeIntent, executeTool } from '@/lib/aiIntentEngine';

export function findWorkflowCommand(text, ctx) {
  const lower = text.toLowerCase();
  const matchedWorkflow = getWorkflowSuggestions(ctx).find(item =>
    lower.includes('hozzak létre hozzá teendőt') ||
    lower.includes('késő számla workflow') ||
    (lower.includes('lejárt') && lower.includes('száml') && (lower.includes('teendő') || lower.includes('késedelmi díj')))
  );

  if (!matchedWorkflow) return null;

  return {
    handled: true,
    intent: 'workflow_confirmation',
    reply: `${matchedWorkflow.prompt}\n\n⚠️ Megerősítésed szükséges a workflow futtatásához.`,
    confirmation: {
      workflowType: matchedWorkflow.type,
      payload: { invoice: matchedWorkflow.invoice },
      reply: matchedWorkflow.prompt,
    },
  };
}

export function findLocalUiCommand(text) {
  const lower = text.toLowerCase();

  if (lower.includes('vezetési mód') || lower.includes('driving mode')) {
    return {
      handled: true,
      intent: 'driving_mode',
      uiAction: 'enable_driving_mode',
      reply: '🚗 Vezetési mód aktiválva. Megnyithatod a Google Maps-et és bekapcsolhatod az útvonalfigyelést.',
    };
  }

  if (lower.includes('torlódás') || lower.includes('forgalom') || lower.includes('útvonal figyelés')) {
    return {
      handled: true,
      intent: 'route_watch',
      uiAction: 'enable_route_watch',
      reply: '🚦 Útvonalfigyelés aktiválva. Nyisd meg a navigációt, és figyelem a vezetési módot.',
    };
  }

  if (lower.includes('navigáció') && lower.includes('nyiss')) {
    return {
      handled: true,
      intent: 'open_navigation_modal',
      uiAction: 'open_navigation_modal',
    };
  }

  return null;
}

export async function findAIToolCommand(text) {
  const result = await recognizeIntent(text);
  if (!result.handled) return null;

  try {
    const toolResult = await executeTool(result.tool, result.params);
    return {
      handled: true,
      intent: result.intent,
      reply: toolResult.message,
      actionResults: [{ tool: result.tool, result: toolResult }]
    };
  } catch (error) {
    return {
      handled: true,
      intent: result.intent,
      reply: `❌ ${error.message || 'A parancs végrehajtása sikertelen volt.'}`,
      actionResults: []
    };
  }
}
