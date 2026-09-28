import { jarvis } from '@/api/jarvisClient';

async function currentUser() {
  return jarvis.auth.me().catch(() => null);
}

function safeJson(value, limit=5000) {
  try {
    const text = JSON.stringify(value);
    return text.length > limit ? text.slice(0,limit) + '…' : text;
  } catch {
    return String(value || '').slice(0,limit);
  }
}

export async function recordActionEpisode({ goal='', source='assistant', tool='', params={}, result={} }={}) {
  try {
    const user = await currentUser();
    if (!user?.email || !tool) return null;
    return await jarvis.entities.AgentEpisode.create({
      created_by:user.email,
      kind:'action',
      goal:String(goal || '').slice(0,500),
      source:String(source || 'assistant').slice(0,60),
      tool:String(tool).slice(0,120),
      param_keys:Object.keys(params || {}).slice(0,30),
      outcome:result?.success === false ? 'failed' : 'success',
      result_summary:String(result?.message || '').slice(0,1000),
      evidence:safeJson({ success:result?.success !== false, data_type:typeof result?.data },1200),
    });
  } catch {
    return null;
  }
}

export async function recordAgentEpisode({ goal='', source='agent', plan=null, steps=[], outcome='success', summary='' }={}) {
  try {
    const user = await currentUser();
    if (!user?.email) return null;
    return await jarvis.entities.AgentEpisode.create({
      created_by:user.email,
      kind:'agent-run',
      goal:String(goal || '').slice(0,1000),
      source:String(source || 'agent').slice(0,60),
      outcome,
      summary:String(summary || '').slice(0,2000),
      tools:(steps || []).map((step) => step.tool).filter(Boolean).slice(0,40),
      plan:safeJson(plan,6000),
      evidence:safeJson((steps || []).map((step) => ({
        id:step.id,
        tool:step.tool,
        ok:step.ok,
        verification:step.verification || null
      })),5000),
    });
  } catch {
    return null;
  }
}

export async function loadRecentAgentEpisodes(limit=8) {
  try {
    const user = await currentUser();
    if (!user?.email) return [];
    return await jarvis.entities.AgentEpisode.filter({created_by:user.email}, '-created_date', Math.max(1,Math.min(30,limit)));
  } catch {
    return [];
  }
}

export async function findRelevantAgentEpisodes(query='', limit=6) {
  try {
    const user = await currentUser();
    if (!user?.email) return [];
    return await jarvis.entities.AgentEpisode.search(String(query || ''), {created_by:user.email}, Math.max(1,Math.min(20,limit)));
  } catch {
    return [];
  }
}

export function formatAgentEpisodes(episodes=[]) {
  return episodes.slice(0,8).map((item) =>
    `- ${item.created_date || ''} | ${item.kind || 'action'} | ${item.goal || item.tool || ''} | ${item.outcome || ''} | ${item.summary || item.result_summary || ''}`
  ).join('\n') || '(none)';
}
