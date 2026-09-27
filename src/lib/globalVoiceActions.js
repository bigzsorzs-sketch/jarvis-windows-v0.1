import { TOOLS, loadFullContext } from '@/lib/assistantTools';
import { runAssistantTurn } from '@/lib/chatOrchestrator';
import { isCallCommand, extractCallTarget, isNavigationVoiceCommand, extractNavigationTarget, isFinishTripCommand, isLastTripSummaryCommand, isShareNavigationDestinationCommand, extractShareNavigationContact } from '@/lib/voiceCommandRouter';
import { findContactForNavigation, startNavigationSession, finishNavigationSession, getFrequentDestinationSuggestion, getLastTripSummary, shareActiveNavigationDestination } from '@/lib/navigationTracker';
import { executeVoiceWorkflowCommand } from '@/lib/voiceWorkflowCommandCenter';

export async function executeGlobalVoiceCommand(transcript) {
  const text = transcript?.trim();
  if (!text) return null;

  const workflowResult = await executeVoiceWorkflowCommand(text, { userMood: 'neutral' });
  if (workflowResult?.handled) return workflowResult;

  if (isCallCommand(text)) {
    const target = extractCallTarget(text);
    if (!target) return { handled: true, reply: '❌ Nem értettem, kit hívjak.' };

    const contactsResult = await TOOLS.search_contacts({ query: target });
    const contact = contactsResult?.data?.[0];
    if (!contact?.phone) {
      return { handled: true, reply: `❌ Nem találtam "${target}" nevű kontaktot.` };
    }

    const callResult = await TOOLS.call_contact({ name: contact.name, phone: contact.phone });
    return { handled: true, reply: callResult.message, actionResults: [{ tool: 'call_contact', result: callResult }] };
  }

  if (isNavigationVoiceCommand(text)) {
    const target = extractNavigationTarget(text);
    if (!target) return { handled: true, reply: '❌ Nem értettem, hová navigáljak.' };

    const contact = await findContactForNavigation(target);
    if (!contact) {
      const frequent = getFrequentDestinationSuggestion();
      return { handled: true, reply: frequent ? `❌ Nem találtam ezt a kontaktot. Gyakran ide mész: ${frequent.contact_name}.` : '❌ Nem találtam ilyen kontaktot.' };
    }
    if (!contact.address) {
      return { handled: true, reply: `❌ ${contact.name} névhez nincs cím elmentve, kérlek pontosítsd.` };
    }

    const started = await startNavigationSession(contact, contact.address);
    return {
      handled: true,
      reply: `🚗 Navigálok ide: ${contact.name} (${started.eta_min} perc)`,
      actionResults: [{ tool: 'start_navigation', result: { success: true, route_id: started.local_id } }]
    };
  }

  if (isFinishTripCommand(text)) {
    const finished = await finishNavigationSession();
    return {
      handled: true,
      reply: `✅ ${finished.summary}`,
      actionResults: [{ tool: 'finish_navigation', result: { success: true, summary: finished.summary, distance_km: finished.distance_km, duration_min: finished.duration_min } }]
    };
  }

  if (isLastTripSummaryCommand(text)) {
    const summary = await getLastTripSummary();
    return {
      handled: true,
      intent: 'last_trip_summary',
      reply: summary.message,
      actionResults: [{ tool: 'last_trip_summary', result: summary }]
    };
  }

  if (isShareNavigationDestinationCommand(text)) {
    const contactName = extractShareNavigationContact(text);
    if (!contactName) return { handled: true, reply: 'Kinek osszam meg a navigációs célpontot?' };
    const shared = await shareActiveNavigationDestination(contactName);
    return {
      handled: true,
      intent: 'share_navigation_destination',
      reply: shared.message,
      actionResults: [{ tool: 'share_navigation_destination', result: shared }]
    };
  }

  const ctx = await loadFullContext();
  const turn = await runAssistantTurn({
    message: text,
    history: [],
    ctx,
    lang: 'hu',
    userMood: 'neutral',
    attachedFiles: [],
    source: 'voice',
  });

  return {
    handled: true,
    intent: 'unified_voice_assistant_turn',
    reply: turn.reply || 'Rendben.',
    actions: turn.actions || [],
    actionResults: turn.actionResults || [],
  };
}