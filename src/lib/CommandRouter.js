import { runAssistantTurn } from '@/lib/chatOrchestrator';
import { executeGlobalVoiceCommand } from '@/lib/globalVoiceActions';
import { findLocalUiCommand, findWorkflowCommand } from '@/lib/commandIntents';
import { findSupportResponse } from '@/lib/supportAssistant';
import { isCallCommand, extractCallTarget, isGlobalVoiceCommand } from '@/lib/voiceCommandRouter';
import normalizeAssistantReply from '@/lib/normalizeAssistantReply';
import { findFastChatReply } from '@/lib/fastChatReplies';
import { isCodeAssistantRequest, runCodeAssistantTurn } from '@/lib/codeAssistant';

function normalizeIntentText(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isSystemCheckRequest(text = '') {
  const input = normalizeIntentText(text);
  return /(?:teljes\s+)?rendszer\s*ellenorzes/.test(input)
    || /rendszert\s+ellenoriz/.test(input)
    || /system\s+check/.test(input);
}

function formatSystemCheck(result = {}) {
  const checks = Array.isArray(result.checks) ? result.checks : [];
  const lines = checks.map((check) => {
    const icon = check.ok ? '✅' : check.severity === 'critical' ? '❌' : '⚠️';
    return `${icon} ${check.label}: ${check.detail}`;
  });
  const heading = result.ok
    ? `✅ Rendszerellenőrzés kész${result.appVersion ? ` – Jarvis v${result.appVersion}` : ''}.`
    : `⚠️ A rendszerellenőrzés hibát talált${result.appVersion ? ` – Jarvis v${result.appVersion}` : ''}.`;
  return [heading, ...lines].join('\n');
}

async function runLocalSystemCheck(text) {
  if (!isSystemCheckRequest(text)) return null;
  if (typeof window === 'undefined' || typeof window.jarvisDesktop?.runSystemCheck !== 'function') {
    return { handled: true, intent: 'system_check', reply: '❌ A helyi rendszerellenőrzés ezen a felületen nem érhető el.' };
  }
  try {
    const result = await window.jarvisDesktop.runSystemCheck();
    return { handled: true, intent: 'system_check', reply: formatSystemCheck(result), actionResults: result?.checks || [] };
  } catch (error) {
    return { handled: true, intent: 'system_check', reply: `❌ A rendszerellenőrzés nem futott le: ${error?.message || 'ismeretlen hiba'}` };
  }
}

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

  const localSystemCheck = attachedFiles.length === 0 ? await runLocalSystemCheck(input) : null;
  if (localSystemCheck) return localSystemCheck;

  const uiCommand = findLocalUiCommand(input);
  if (uiCommand) return uiCommand;

  const workflowCommand = findWorkflowCommand(input, ctx);
  if (workflowCommand) return workflowCommand;

  const supportResponse = findSupportResponse(input, ctx, lang);
  if (supportResponse) return supportResponse;

  if (isGlobalVoiceCommand(input)) {
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