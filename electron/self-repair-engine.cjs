'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ALLOWED_ACTIONS = new Set([
  'restart_renderer',
  'restart_app',
  'clear_browser_cache',
  'reset_ai_model',
  'run_verified_update',
  'create_repair_report',
  'no_action',
]);

const FORBIDDEN_TARGETS = [
  'security/core-rules',
  'electron/security/policy-engine',
  'jarvis:update:',
  'core rules',
  'policy engine',
];

function redact(value='') {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, '[REDACTED_API_KEY]')
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{20,})\b/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/([A-Z0-9._%+-])[A-Z0-9._%+-]*(@[A-Z0-9.-]+\.[A-Z]{2,})/gi, '$1***$2')
    .slice(0, 16000);
}

function compactQuery(report={}) {
  const text = [report.message, report.stack, report.module]
    .filter(Boolean)
    .join(' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[A-Za-z]:\\[^\s)]+/g, ' ')
    .replace(/[^A-Za-z0-9_\-. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.split(' ').slice(0, 16).join(' ').slice(0, 220);
}

function safeJsonParse(value) {
  if (value && typeof value === 'object') return value;
  const text=String(value || '').replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  try { return JSON.parse(text); } catch { return null; }
}

class SelfRepairEngine {
  constructor({ userDataPath, documentsPath, appVersion, invokeAI, getSettings, appendAudit }) {
    this.userDataPath=userDataPath;
    this.documentsPath=documentsPath;
    this.appVersion=appVersion;
    this.invokeAI=invokeAI;
    this.getSettings=getSettings;
    this.appendAudit=appendAudit || (()=>{});
    this.repairDir=path.join(userDataPath,'repairs');
    this.proposalsPath=path.join(this.repairDir,'proposals.json');
    fs.mkdirSync(this.repairDir,{recursive:true});
  }

  enabled() {
    const settings=this.getSettings?.() || {};
    return settings.supervisedSelfRepair !== false;
  }

  loadProposals() {
    try { return JSON.parse(fs.readFileSync(this.proposalsPath,'utf8')); } catch { return []; }
  }

  saveProposals(items) {
    fs.mkdirSync(path.dirname(this.proposalsPath),{recursive:true});
    fs.writeFileSync(this.proposalsPath,JSON.stringify(items.slice(-100),null,2),'utf8');
  }

  list() {
    return this.loadProposals().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async searchSolutions(report) {
    const query=encodeURIComponent(compactQuery(report) || 'Electron application crash');
    const findings=[];

    try {
      const url=`https://api.github.com/search/issues?q=${query}+is%3Aissue&per_page=5`;
      const res=await fetch(url,{headers:{'Accept':'application/vnd.github+json','User-Agent':'Jarvis-SelfRepair'}});
      if(res.ok) {
        const data=await res.json();
        for(const item of (data.items||[]).slice(0,5)) {
          findings.push({
            source:'GitHub',
            title:redact(item.title),
            url:item.html_url,
            snippet:redact(item.body || '').slice(0,600),
          });
        }
      }
    } catch {}

    try {
      const url=`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&site=stackoverflow&pagesize=5&q=${query}`;
      const res=await fetch(url,{headers:{'User-Agent':'Jarvis-SelfRepair'}});
      if(res.ok) {
        const data=await res.json();
        for(const item of (data.items||[]).slice(0,5)) {
          findings.push({
            source:'Stack Overflow',
            title:redact(item.title),
            url:item.link,
            snippet:'',
          });
        }
      }
    } catch {}

    return findings.slice(0,8);
  }

  validateProposal(raw={}) {
    let action=String(raw.action || 'no_action');
    const combined=JSON.stringify(raw).toLowerCase();
    const protectedTarget=FORBIDDEN_TARGETS.some(term=>combined.includes(term));
    if(protectedTarget) action='no_action';
    if(!ALLOWED_ACTIONS.has(action)) action='create_repair_report';

    return {
      summary:redact(raw.summary || 'Jarvis hibát talált.'),
      likelyCause:redact(raw.likelyCause || raw.cause || 'Az ok nem állapítható meg biztosan.'),
      confidence:Math.max(0,Math.min(100,Number(raw.confidence)||0)),
      action,
      explanation:redact(raw.explanation || raw.reason || ''),
      requiresCodeChange:Boolean(raw.requiresCodeChange),
      protectedTarget,
    };
  }

  async diagnose(report={}) {
    if(!this.enabled()) return {status:'disabled'};

    const safeReport={
      type:redact(report.type || 'runtime'),
      module:redact(report.module || ''),
      message:redact(report.message || ''),
      stack:redact(report.stack || ''),
      context:redact(typeof report.context === 'string' ? report.context : JSON.stringify(report.context || {})),
      version:this.appVersion,
    };

    const findings=await this.searchSolutions(safeReport);
    const prompt=[
      'You are the supervised self-repair planner for Jarvis Desktop.',
      'Diagnose the error using the sanitized report and public technical search findings.',
      'Never propose modifying Core Rules, their signatures, the Policy Engine, updater verification, authentication controls, or disabling security.',
      'Choose exactly one action from: restart_renderer, restart_app, clear_browser_cache, reset_ai_model, run_verified_update, create_repair_report, no_action.',
      'Use create_repair_report when source-code modification is required. Arbitrary generated code must never be executed directly.',
      'Return strict JSON with keys: summary, likelyCause, confidence (0-100), action, explanation, requiresCodeChange.',
      '',
      'ERROR REPORT:',
      JSON.stringify(safeReport),
      '',
      'PUBLIC SEARCH FINDINGS:',
      JSON.stringify(findings),
    ].join('\n');

    let raw;
    try {
      raw=await this.invokeAI({prompt, response_json_schema:true});
    } catch (error) {
      raw={
        summary:'Automatikus AI-diagnózis nem sikerült.',
        likelyCause:redact(error?.message || 'AI diagnosis unavailable'),
        confidence:0,
        action:'create_repair_report',
        explanation:'A hiba és a keresési találatok menthetők kézi javításhoz.',
        requiresCodeChange:true,
      };
    }

    const aiPayload=raw?.data?.result ?? raw?.result ?? raw;
    const parsed=safeJsonParse(aiPayload) || aiPayload || {};
    const plan=this.validateProposal(parsed);
    const proposal={
      id:crypto.randomUUID(),
      createdAt:new Date().toISOString(),
      status:'pending',
      report:safeReport,
      findings,
      ...plan,
    };
    const all=this.loadProposals();
    all.push(proposal);
    this.saveProposals(all);
    this.appendAudit('self_repair_proposed',{proposalId:proposal.id,action:proposal.action,confidence:proposal.confidence});
    return proposal;
  }

  updateStatus(id,status,result=null) {
    const all=this.loadProposals();
    const index=all.findIndex(x=>x.id===id);
    if(index<0) throw new Error('SELF_REPAIR_PROPOSAL_NOT_FOUND');
    all[index]={...all[index],status,result,updatedAt:new Date().toISOString()};
    this.saveProposals(all);
    return all[index];
  }

  writeRepairReport(proposal) {
    const dir=path.join(this.documentsPath,'Jarvis Repairs');
    fs.mkdirSync(dir,{recursive:true});
    const safeId=proposal.id.replace(/[^A-Za-z0-9_-]/g,'');
    const file=path.join(dir,`repair-${safeId}.json`);
    fs.writeFileSync(file,JSON.stringify({
      format:'jarvis-supervised-repair-v1',
      generatedAt:new Date().toISOString(),
      appVersion:this.appVersion,
      proposal,
      note:'Code-level fixes are staged for a signed Jarvis update. This file is not executable.',
    },null,2),'utf8');
    return file;
  }
}

module.exports={SelfRepairEngine,ALLOWED_ACTIONS};
