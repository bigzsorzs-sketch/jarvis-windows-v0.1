import { getWorkflowSuggestions } from '@/lib/workflowEngine';

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

export function findTravelTimeCommand(text) {
  const lower = text.toLowerCase();
  const normalized = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const postcodeMatch = text.toUpperCase().match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/);
  const asksTravelTime = normalized.includes('mennyi') && (normalized.includes('ido') || normalized.includes('idő')) && (normalized.includes('erek') || normalized.includes('ernek'));
  const destinationHungary = normalized.includes('magyarba') || normalized.includes('magyarorszag') || normalized.includes('hungary');

  if (!asksTravelTime || !destinationHungary) return null;

  const origin = postcodeMatch ? postcodeMatch[0].replace(/\s+/g, ' ') : 'WF3 2EY';
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent('Hungary')}&travelmode=driving`;

  return {
    handled: true,
    intent: 'travel_time_estimate',
    reply: `🚗 ${origin} irányából Magyarországra autóval általában kb. 18–22 óra tiszta vezetés, megállókkal inkább 1–2 nap. Pontos, aktuális forgalmi idő: ${mapsUrl}`,
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