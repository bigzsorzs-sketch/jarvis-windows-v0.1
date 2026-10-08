import { runAssistantTurn } from '@/lib/chatOrchestrator';
import { executeGlobalVoiceCommand } from '@/lib/globalVoiceActions';
import { findLocalUiCommand, findWorkflowCommand, findAIToolCommand } from '@/lib/commandIntents';
import { findSupportResponse } from '@/lib/supportAssistant';
import { isCallCommand, extractCallTarget, isGlobalVoiceCommand } from '@/lib/voiceCommandRouter';
import normalizeAssistantReply from '@/lib/normalizeAssistantReply';
import { findFastChatReply } from '@/lib/fastChatReplies';
import { isCodeAssistantRequest, runCodeAssistantTurn } from '@/lib/codeAssistant';
import { shouldUseAgentPlanner, runAgentTask } from '@/lib/agentOrchestrator';
import { resolveGlobalUiCommand } from '@/lib/globalVoiceNavigator';

async function findLegacyCallCommand(text, handlers = {}) {
  const lower = text.toLowerCase();
  if (!isCallCommand(lower)) return null;

  const target = extractCallTarget(lower);
  if (!target) return null;

  if (typeof handlers.onCallContact === 'function') {
    await handlers.onCallContact(target);
    return { handled: true, intent: 'call_contact_legacy', reply: '' };
  }

  return { handled: true, intent: 'call_contact', reply: `❌ Nem tudom elindítani a hívást ezen a felületen.` };
}

export async function routeUserCommand({
  text,
  source = 'chat',
  history = [],
  ctx,
  lang = 'hu',
  userMood = 'neutral',
  attachedFiles = [],
  handlers = {},
}) {
  const input = typeof text === 'string' ? text.trim() : '';
  if (!input && attachedFiles.length === 0) return { handled: false };

  if (isCodeAssistantRequest(input, attachedFiles)) {
    const reply = await runCodeAssistantTurn({ message: input, history, attachedFiles, lang });
    return { handled: true, intent: 'code_assistant', reply };
  }

  const fastReply = attachedFiles.length === 0 ? findFastChatReply(input, lang) : null;
  if (fastReply) return fastReply;

  // A single-intent route or voice fallback must not swallow later operations.
  if (attachedFiles.length === 0 && shouldUseAgentPlanner(input)) {
    const agentResult = await runAgentTask({ goal:input, ctx, lang, source });
    if (agentResult?.handled) return agentResult;
  }

  const uiCommand = findLocalUiCommand(input);
  if (uiCommand) return uiCommand;

  const workflowCommand = findWorkflowCommand(input, ctx);
  if (workflowCommand) return workflowCommand;

  const aiToolCommand = await findAIToolCommand(input);
  if (aiToolCommand?.handled) return aiToolCommand;

  const globalUiCommand = attachedFiles.length === 0 ? resolveGlobalUiCommand(input) : null;
  if (globalUiCommand) {
    return {
      handled:true,
      intent:'global_ui_command',
      uiCommand:globalUiCommand,
      reply:'',
    };
  }

  const supportResponse = findSupportResponse(input, ctx, lang);
  if (supportResponse) return supportResponse;

  if (source === 'voice' || source === 'live' || isGlobalVoiceCommand(input)) {
    const globalCommand = await executeGlobalVoiceCommand(input);
    if (globalCommand?.handled) {
      return {
        handled: true,
        intent: globalCommand.intent || `global_${source}`,
        reply: normalizeAssistantReply(globalCommand.reply),
        actionResults: globalCommand.actionResults || [],
      };
    }
  }

  const legacyCall = await findLegacyCallCommand(input, handlers);
  if (legacyCall?.handled) return legacyCall;

  const turn = await runAssistantTurn({
    message: input,
    history,
    ctx,
    lang,
    userMood,
    attachedFiles,
    source,
  });

  return {
    handled: true,
    intent: 'assistant_turn',
    turn,
    reply: normalizeAssistantReply(turn.reply),
    actions: turn.actions || [],
    actionResults: turn.actionResults || [],
  };
}
