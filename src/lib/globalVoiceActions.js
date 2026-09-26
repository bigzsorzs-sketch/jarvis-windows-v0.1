import { TOOLS, loadFullContext, buildSystemPrompt, parseActions, executeActions } from '@/lib/assistantTools';
import { invokeWithRetry } from '@/lib/llmGateway';
import { isCallCommand, extractCallTarget, isNavigationVoiceCommand, extractNavigationTarget, isFinishTripCommand, isLastTripSummaryCommand, isShareNavigationDestinationCommand, extractShareNavigationContact, isEmergencyCallCommand, getEmergencyCallNumber, isGlucoseQueryCommand } from '@/lib/voiceCommandRouter';
import { findContactForNavigation, findSavedLocationForNavigation, startNavigationSession, startSavedLocationNavigation, finishNavigationSession, getFrequentDestinationSuggestion, getLastTripSummary, shareActiveNavigationDestination } from '@/lib/navigationTracker';
import { executeVoiceWorkflowCommand } from '@/lib/voiceWorkflowCommandCenter';
import { executeSituationAwareCommand } from '@/lib/situationOrchestrator';
import { requestEmergencyCall } from '@/lib/emergencyActions';
import { getLatestGlucoseSummary } from '@/lib/health/healthCapabilities';

export async function executeGlobalVoiceCommand(transcript) {
  const text = transcript?.trim();
  if (!text) return null;

  // Explicit emergency requests bypass AI routing and long-running workflows.
  if (isEmergencyCallCommand(text)) {
    const number = getEmergencyCallNumber(text) || '999';
    const result = await requestEmergencyCall(number);
    return {
      handled: true,
      intent: 'emergency_call_handoff',
      reply: result.message,
      actionResults: [{ tool: 'emergency_call_handoff', result }],
    };
  }

  // Reading the latest recorded glucose value is deterministic and does not need the AI brain.
  if (isGlucoseQueryCommand(text)) {
    const result = await getLatestGlucoseSummary();
    return {
      handled: true,
      intent: 'latest_glucose',
      reply: result.message,
      actionResults: [{ tool: 'latest_glucose', result }],
    };
  }

  // First let the active module interpret the request in its live context.
  // This is what makes "nézd meg, változott-e" meaningful while OBD is open,
  // without forcing the user to name menus or repeat the whole situation.
  const situationResult = await executeSituationAwareCommand(text);
  if (situationResult?.handled) return situationResult;

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
    if (contact?.address) {
      const started = await startNavigationSession(contact, contact.address);
      return {
        handled: true,
        reply: `🚗 Navigálok ide: ${contact.name} (${started.eta_min} perc)`,
        actionResults: [{ tool: 'start_navigation', result: { success: true, route_id: started.local_id } }]
      };
    }

    const savedLocation = await findSavedLocationForNavigation(target);
    if (savedLocation) {
      const started = await startSavedLocationNavigation(savedLocation);
      return {
        handled: true,
        reply: `🚗 Navigálok ide: ${savedLocation.name} (${started.eta_min} perc)`,
        actionResults: [{ tool: 'start_saved_location_navigation', result: { success: true, route_id: started.local_id, location_id: savedLocation.id } }]
      };
    }

    if (contact && !contact.address) {
      return { handled: true, reply: `❌ ${contact.name} névhez nincs cím elmentve, kérlek pontosítsd.` };
    }

    const frequent = getFrequentDestinationSuggestion();
    return {
      handled: true,
      reply: frequent
        ? `❌ Nem találtam ezt a célpontot. Gyakran ide mész: ${frequent.contact_name}.`
        : '❌ Nem találtam ilyen kontaktot vagy mentett helyet.'
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
  const systemPrompt = `${buildSystemPrompt(ctx, 'Mindig magyarul válaszolj.', 'neutral')}

A felhasználó hangparancsot adott. Ha művelet kell, kizárólag JSON action blokkot használj ebben a formában: \`\`\`actions [{"tool":"create_task","params":{}}] \`\`\`. Ha nem kell művelet, adj nagyon rövid magyar választ.`;

  const reply = await invokeWithRetry({
    prompt: `${systemPrompt}

Felhasználó: ${text}

Asszisztens:`,
    model: 'gemini_3_flash',
  });

  const parsedReply = typeof reply === 'string' ? reply : (reply?.result ?? reply?.data?.result ?? reply?.data ?? '');
  const actions = parseActions(parsedReply);

  if (actions.length === 0) {
    return { handled: true, reply: parsedReply || 'Rendben.', actionResults: [] };
  }

  const actionResults = await executeActions(actions);
  const visibleReply = parsedReply.replace(/```actions[\s\S]*?```/gi, '').trim() || actionResults.map(a => a.result?.message).filter(Boolean).join('\n');

  return {
    handled: true,
    reply: visibleReply,
    actionResults,
  };
}