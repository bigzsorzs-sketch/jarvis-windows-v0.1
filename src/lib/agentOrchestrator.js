import { invokeWithRetry } from '@/lib/llmGateway';
import { executeActions } from '@/lib/assistantTools';
import { buildCapabilityPrompt, getCapability, listToolCapabilities } from '@/lib/capabilityRegistry';
import { findRelevantAgentEpisodes, formatAgentEpisodes, recordAgentEpisode } from '@/lib/agentMemory';

function parseJsonObject(value) {
  if (value && typeof value === 'object') return value;
  const raw = String(value || '').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'').trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start,end+1));
  throw new Error('AGENT_PLAN_INVALID_JSON');
}

export function shouldUseAgentPlanner(text='') {
  const clean = String(text || '').trim().toLowerCase();
  if (clean.length < 18) return false;
  if (/^(szia|hello|hi|köszönöm|koszonom)\b/.test(clean)) return false;
  const sequencing = /(először|eloszor|aztán|aztan|majd|utána|utana|és utána|and then|then|after that)/i.test(clean);
  const multiIntent = (clean.match(/\b(hozz létre|hozz letre|küld|kuld|írj|irj|keress|ellenőrizd|ellenorizd|kapcsold|nyisd|mentsd|rögzítsd|rogzitsd|create|send|find|check|open|save|log)\b/gi) || []).length >= 2;
  return sequencing || multiIntent;
}

function compactContext(ctx={}) {
  return {
    openTasks:Array.isArray(ctx.todos) ? ctx.todos.length : 0,
    pendingReminders:Array.isArray(ctx.reminders) ? ctx.reminders.length : 0,
    contactCount:Array.isArray(ctx.contacts) ? ctx.contacts.length : 0,
    recentActions:Array.isArray(ctx.actions) ? ctx.actions.slice(0,6).map((item) => ({type:item.action_type,description:item.description,status:item.status})) : [],
  };
}

async function makePlan({ goal, ctx, failureFeedback='', round=1 }) {
  const memories = await findRelevantAgentEpisodes(goal,6);
  const prompt = `You are the Jarvis Planner. Convert the user's multi-step goal into a small executable plan using ONLY registered tools.

CAPABILITY REGISTRY:
${buildCapabilityPrompt()}

Approval meanings:
- instant: may execute immediately.
- confirm: Jarvis runtime will ask the owner before execution.
- owner: never execute automatically.

Rules:
- Use only tool names present in the registry.
- Maximum 6 steps.
- Do not invent missing required parameters.
- If critical information is missing, set status="clarify" and ask one concise question.
- Keep steps ordered.
- success_criteria must be concrete and checkable from the tool result.
- Do not include UI navigation routes here; those are handled before the agent.
- Output JSON only.

Schema:
{
  "status":"ready|clarify|done",
  "summary":"short plan summary",
  "question":"only for clarify",
  "steps":[
    {"id":"s1","tool":"registered_tool","params":{},"success_criteria":"result.success is true"}
  ]
}

USER GOAL:
${goal}

ROUND:
${round}

PREVIOUS FAILURE FEEDBACK:
${failureFeedback || '(none)'}

RECENT VERIFIED OPERATION MEMORY:
${formatAgentEpisodes(memories)}

NON-SENSITIVE CURRENT CONTEXT:
${JSON.stringify(compactContext(ctx))}`;

  const response = await invokeWithRetry({
    prompt,
    task_type:'reasoning',
    response_json_schema:{type:'object'},
    queueKey:'jarvis-agent-plan',
    contains_sensitive_context:false,
    request_origin:(source === 'chat' || source === 'voice') ? 'conversation' : undefined,
  },1);

  return parseJsonObject(response?.data?.result ?? response?.data ?? response);
}

function verifyStep(step, execution) {
  const result = execution?.result || {};
  if (result.success === false) return { ok:false, reason:result.message || 'Tool reported failure' };
  if (execution?.blocked) return { ok:false, reason:execution.blocked };
  return { ok:true, reason:result.message || step.success_criteria || 'Tool completed successfully' };
}

function renderAgentReply(plan, executed, lang='hu') {
  if (lang !== 'hu') {
    const ok = executed.filter((item) => item.ok).length;
    return `Completed ${ok}/${executed.length} planned steps.`;
  }
  const ok = executed.filter((item) => item.ok).length;
  const failed = executed.filter((item) => !item.ok);
  if (!failed.length) return `Kész. ${ok}/${executed.length} tervezett lépés sikeresen végrehajtva.`;
  return `Részben kész: ${ok}/${executed.length} lépés sikerült. ${failed[0].verification || 'Egy lépés nem sikerült.'}`;
}

export async function runAgentTask({ goal, ctx={}, lang='hu', source='chat' }={}) {
  const cleanGoal = String(goal || '').trim();
  if (!cleanGoal) return { handled:false };

  let failureFeedback = '';
  let finalPlan = null;
  const allExecuted = [];

  for (let round=1; round<=2; round+=1) {
    const plan = await makePlan({goal:cleanGoal,ctx,failureFeedback,round});
    finalPlan = plan;

    if (plan.status === 'clarify') {
      await recordAgentEpisode({goal:cleanGoal,source,plan,steps:allExecuted,outcome:'clarify',summary:plan.question || ''});
      return { handled:true, intent:'agent_clarify', reply:plan.question || 'Pontosítsd a kérést.' };
    }
    if (plan.status === 'done' || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      await recordAgentEpisode({goal:cleanGoal,source,plan,steps:allExecuted,outcome:'success',summary:plan.summary || ''});
      return { handled:true, intent:'agent_done', reply:plan.summary || 'Kész.' };
    }

    const failures = [];
    for (const step of plan.steps.slice(0,6)) {
      const capability = getCapability(step.tool);
      if (!capability || capability.type !== 'tool') {
        failures.push(`${step.id || step.tool}: unregistered tool`);
        allExecuted.push({...step,ok:false,verification:'Nem regisztrált képesség.'});
        continue;
      }

      const [execution] = await executeActions([{tool:step.tool,params:step.params || {}}], {
        source:'agent',
        goal:cleanGoal,
      });
      const verification = verifyStep(step,execution);
      allExecuted.push({
        id:step.id || `step-${allExecuted.length+1}`,
        tool:step.tool,
        ok:verification.ok,
        verification:verification.reason,
        result:execution?.result || null,
      });
      if (!verification.ok) failures.push(`${step.id || step.tool}: ${verification.reason}`);
    }

    if (!failures.length) {
      const reply = renderAgentReply(plan,allExecuted,lang);
      await recordAgentEpisode({goal:cleanGoal,source,plan,steps:allExecuted,outcome:'success',summary:reply});
      return { handled:true, intent:'agent_task', reply, plan, actionResults:allExecuted };
    }

    failureFeedback = failures.join('\n');
  }

  const reply = renderAgentReply(finalPlan,allExecuted,lang);
  await recordAgentEpisode({goal:cleanGoal,source,plan:finalPlan,steps:allExecuted,outcome:'partial',summary:reply});
  return { handled:true, intent:'agent_task_partial', reply, plan:finalPlan, actionResults:allExecuted };
}

export function registeredAgentTools() {
  return listToolCapabilities().map((item) => item.tool);
}
