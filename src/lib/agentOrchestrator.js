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

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validatePlan(plan) {
  if (!isObject(plan) || !['ready','clarify','done'].includes(plan.status)) throw new Error('AGENT_PLAN_INVALID');
  if (plan.status === 'clarify') {
    if (typeof plan.question !== 'string' || !plan.question.trim()) throw new Error('AGENT_PLAN_MISSING_QUESTION');
    return plan;
  }
  if (plan.status === 'done') return plan;
  if (!Array.isArray(plan.steps) || !plan.steps.length || plan.steps.length > 6) throw new Error('AGENT_PLAN_INVALID_STEPS');
  const ids = new Set();
  for (const step of plan.steps) {
    if (!isObject(step) || typeof step.id !== 'string' || !/^[\w-]{1,64}$/.test(step.id)
      || ids.has(step.id) || typeof step.tool !== 'string' || !isObject(step.params)) throw new Error('AGENT_PLAN_INVALID_STEP');
    if (step.expected_result !== undefined && (!isObject(step.expected_result)
      || Object.keys(step.expected_result).length > 10)) throw new Error('AGENT_PLAN_INVALID_EXPECTATION');
    ids.add(step.id);
  }
  return plan;
}

const UNSAFE_KEYS = new Set(['__proto__','prototype','constructor']);

function readResultPath(result, path) {
  const keys = String(path).split('.');
  if (!keys.length || keys.length > 8 || keys.some(key => !/^[\w-]+$/.test(key) || UNSAFE_KEYS.has(key))) {
    throw new Error('AGENT_RESULT_REFERENCE_INVALID');
  }
  let value = result;
  for (const key of keys) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value,key)) throw new Error('AGENT_RESULT_REFERENCE_MISSING');
    value = value[key];
  }
  if (value === undefined) throw new Error('AGENT_RESULT_REFERENCE_MISSING');
  return value;
}

function resolveParams(value, completedById, depth=0) {
  if (depth > 8) throw new Error('AGENT_PARAMS_TOO_DEEP');
  if (Array.isArray(value)) return value.map(item => resolveParams(item,completedById,depth+1));
  if (!isObject(value)) return value;
  if (Object.hasOwn(value,'$ref')) {
    if (Object.keys(value).length !== 1 || typeof value.$ref !== 'string') throw new Error('AGENT_RESULT_REFERENCE_INVALID');
    const [id,...path] = value.$ref.split('.');
    const completed = completedById.get(id);
    if (!completed?.ok || !path.length) throw new Error('AGENT_RESULT_REFERENCE_MISSING');
    return resolveParams(readResultPath(completed.result,path.join('.')),new Map(),depth+1);
  }
  return Object.fromEntries(Object.entries(value).map(([key,item]) => {
    if (UNSAFE_KEYS.has(key)) throw new Error('AGENT_PARAMS_UNSAFE_KEY');
    return [key,resolveParams(item,completedById,depth+1)];
  }));
}

function actionKey(tool, params) {
  const sort = value => Array.isArray(value) ? value.map(sort)
    : isObject(value) ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => [key,sort(item)])) : value;
  return JSON.stringify({tool,params:sort(params)});
}

// Keep replan prompts bounded; full receipts remain local for result references.
function compactReceipt(value, depth=0) {
  if (typeof value === 'string') return value.slice(0,300);
  if (Array.isArray(value)) return depth < 2 ? value.slice(0,3).map(item => compactReceipt(item,depth+1)) : '[array]';
  if (isObject(value)) return depth < 3 ? Object.fromEntries(Object.entries(value).slice(0,12).map(([key,item]) => [key,compactReceipt(item,depth+1)])) : '[object]';
  return value;
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

async function makePlan({ goal, ctx, source, completed=[], failureFeedback='', round=1 }) {
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
- A later parameter may use {"$ref":"s1.data.id"} to read a VERIFIED earlier step result. Never invent IDs or refer to future steps.
- On recovery, keep the original step IDs and all unfinished steps. Do not repeat completed writes; their receipts are already available.
- Set status="done" only when verified receipts cover every requested operation.
- success_criteria must be concrete and checkable from the tool result.
- Use expected_result for required result fields, e.g. {"data.sent":true} when the user requires an email to be sent. Opening a draft is not sending.
- A cached smart-device state with data.verified=false is not live verification.
- Do not include UI navigation routes here; those are handled before the agent.
- Output JSON only.

Schema:
{
  "status":"ready|clarify|done",
  "summary":"short plan summary",
  "question":"only for clarify",
  "steps":[
    {"id":"s1","tool":"registered_tool","params":{},"success_criteria":"result.success is true","expected_result":{}}
  ]
}

USER GOAL:
${goal}

ROUND:
${round}

PREVIOUS FAILURE FEEDBACK:
${failureFeedback || '(none)'}

COMPLETED STEP RECEIPTS (do not execute these again):
${JSON.stringify(completed.map(item => compactReceipt(item)))}

RECENT OPERATION MEMORY (historical context, not proof for this run):
${formatAgentEpisodes(memories)}

CURRENT CONTEXT:
${JSON.stringify(compactContext(ctx))}`;

  const response = await invokeWithRetry({
    prompt,
    task_type:'reasoning',
    response_json_schema:{type:'object'},
    queueKey:'jarvis-agent-plan',
    contains_sensitive_context:true,
    request_origin:['chat','voice','live'].includes(source) ? 'conversation' : undefined,
  },1);

  return validatePlan(parseJsonObject(response?.data?.result ?? response?.data ?? response));
}

function verifyStep(step, execution) {
  if (execution?.blocked) return { ok:false, reason:execution.blocked };
  const result = execution?.result;
  if (result?.success !== true) return { ok:false, reason:result?.message || 'A művelet nem adott igazolt sikeres eredményt.' };
  if (result.data?.verified === false) return { ok:false, reason:result.message || 'A kért élő állapot nem volt ellenőrizhető.' };
  for (const [path,expected] of Object.entries(step.expected_result || {})) {
    try {
      if (!['data','success'].includes(path.split('.')[0]) || (expected !== null && typeof expected === 'object')
        || readResultPath(result,path) !== expected) return { ok:false, reason:`A kért eredmény nem igazolt: ${path}. ${result.message || ''}` };
    } catch {
      return { ok:false, reason:`A kért eredmény hiányzik: ${path}.` };
    }
  }
  return { ok:true, reason:result.message || 'Tool completed successfully' };
}

function renderAgentReply(plan, executed, lang='hu') {
  const ok = executed.filter((item) => item.ok).length;
  const failed = executed.filter((item) => !item.ok);
  const hu = String(lang).toLowerCase().startsWith('hu');
  const headline = failed.length
    ? hu ? `Részben kész: ${ok}/${executed.length} lépés sikerült.` : `Partly completed: ${ok}/${executed.length} planned steps.`
    : hu ? `Kész. ${ok}/${executed.length} tervezett lépés sikeresen végrehajtva.` : `Completed ${ok}/${executed.length} planned steps.`;
  const details = (failed.length ? [failed[0],...executed.filter(item => item.ok)] : executed)
    .slice(0,6).map(item => String(item.verification || '').slice(0,300)).filter(Boolean);
  return [headline,...details].join('\n');
}

export async function runAgentTask({ goal, ctx={}, lang='hu', source='chat' }={}) {
  const cleanGoal = String(goal || '').trim();
  if (!cleanGoal) return { handled:false };

  let failureFeedback = '';
  let finalPlan = null;
  const allExecuted = [];
  const stepStates = new Map();
  const completedById = new Map();
  const completedByAction = new Map();
  const finish = async (intent, outcome, reply) => {
    await recordAgentEpisode({goal:cleanGoal,source,plan:finalPlan,steps:allExecuted,outcome,summary:reply});
    return {handled:true,intent,reply,plan:finalPlan,actionResults:allExecuted};
  };

  for (let round=1; round<=2; round+=1) {
    let plan;
    try {
      plan = await makePlan({goal:cleanGoal,ctx,source,completed:[...completedById.values()],failureFeedback,round});
    } catch {
      const partial = stepStates.size > 0;
      const reply = partial ? renderAgentReply(finalPlan,[...stepStates.values()],lang)
        : String(lang).startsWith('hu') ? 'Nem sikerült megbízható végrehajtási tervet készíteni. Nem indítottam műveletet.'
          : 'I could not create a reliable execution plan. No operation was started.';
      return finish(partial ? 'agent_task_partial' : 'agent_task_failed',partial ? 'partial' : 'failed',reply);
    }
    finalPlan = plan;

    if (plan.status === 'clarify') {
      const progress = stepStates.size ? renderAgentReply(plan,[...stepStates.values()],lang) + '\n' : '';
      return finish('agent_clarify','clarify',progress + plan.question.trim());
    }
    if (plan.status === 'done') {
      const verified = stepStates.size > 0 && [...stepStates.values()].every(item => item.ok);
      if (!verified && stepStates.size) {
        return finish('agent_task_partial','partial',renderAgentReply(plan,[...stepStates.values()],lang));
      }
      return finish(verified ? 'agent_done' : 'agent_task_failed',verified ? 'success' : 'failed',
        verified ? renderAgentReply(plan,[...stepStates.values()],lang)
          : String(lang).startsWith('hu') ? 'A kért műveletek végrehajtása nincs igazolva.' : 'The requested operations have not been verified.');
    }

    for (const step of plan.steps) {
      if (!stepStates.has(step.id)) stepStates.set(step.id,{...step,ok:false,verification:'Ez a lépés még nem lett végrehajtva.'});
    }
    const failures = [];
    for (const step of plan.steps) {
      const capability = getCapability(step.tool);
      let params, key;
      try {
        if (!capability || capability.type !== 'tool' || capability.enabled === false) throw new Error('Nem elérhető regisztrált képesség.');
        params = resolveParams(step.params,completedById);
        key = actionKey(step.tool,params);
        const previous = completedById.get(step.id);
        if (previous && actionKey(previous.tool,previous.params) !== key) throw new Error('Egy már befejezett lépés azonosítója megváltozott.');
      } catch (error) {
        const failed = {...step,ok:false,verification:error.message};
        stepStates.set(step.id,failed);
        allExecuted.push(failed);
        failures.push(`${step.id}: ${error.message}`);
        break;
      }

      const saved = round > 1 ? completedByAction.get(key) : null;
      let execution;
      try {
        [execution] = saved ? [{result:saved.result}] : await executeActions([{tool:step.tool,params}], {source:'agent',goal:cleanGoal});
      } catch {
        execution = {result:{success:false,message:'A művelet eredménye nem ellenőrizhető.',unknownOutcome:true}};
      }
      const verification = verifyStep(step,execution);
      const receipt = {id:step.id,tool:step.tool,params,ok:verification.ok,verification:verification.reason,result:execution?.result || null};
      stepStates.set(step.id,receipt);
      if (!saved) allExecuted.push(receipt);
      if (verification.ok) {
        completedById.set(step.id,receipt);
        completedByAction.set(key,receipt);
      } else {
        failures.push(`${step.id}: ${verification.reason}`);
        // A write may have committed before its response was lost. Do not replay
        // it, or continue dependent actions, without a fresh owner instruction.
        if (execution?.blocked || capability.retrySafe !== true || execution?.result?.unknownOutcome) {
          return finish('agent_task_partial','partial',renderAgentReply(plan,[...stepStates.values()],lang));
        }
        break;
      }
    }

    if (!failures.length && [...stepStates.values()].every(item => item.ok)) {
      return finish('agent_task','success',renderAgentReply(plan,[...stepStates.values()],lang));
    }

    failureFeedback = failures.join('\n') || 'Some original steps are still unverified. Keep their IDs and complete them.';
  }

  return finish('agent_task_partial','partial',renderAgentReply(finalPlan,[...stepStates.values()],lang));
}

export function registeredAgentTools() {
  return listToolCapabilities().map((item) => item.tool);
}
