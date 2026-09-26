'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SelfRepairEngine } = require('./self-repair-engine.cjs');

class SelfRepairController {
  constructor({
    app,
    dialog,
    shell,
    getMainWindow,
    policy,
    invokeAI,
    getSettings,
    saveSettings,
    oneClickUpdate,
    appendAudit,
  }) {
    this.app=app;
    this.dialog=dialog;
    this.shell=shell;
    this.getMainWindow=getMainWindow;
    this.policy=policy;
    this.getSettings=getSettings;
    this.saveSettings=saveSettings;
    this.oneClickUpdate=oneClickUpdate;
    this.appendAudit=appendAudit || (()=>{});
    this.recentFingerprints=new Map();

    this.engine=new SelfRepairEngine({
      userDataPath:app.getPath('userData'),
      documentsPath:app.getPath('documents'),
      appVersion:app.getVersion(),
      invokeAI,
      getSettings,
      appendAudit,
    });
  }

  enabled() {
    return this.engine.enabled();
  }

  list() {
    return this.engine.list();
  }

  backupSettings(label='repair') {
    try {
      const src=path.join(this.app.getPath('userData'),'settings.json');
      if(!fs.existsSync(src)) return null;
      const stamp=new Date().toISOString().replace(/[:.]/g,'-');
      const dir=path.join(this.app.getPath('userData'),'backups','self-repair',stamp);
      fs.mkdirSync(dir,{recursive:true});
      const dest=path.join(dir,label+'-settings.json');
      fs.copyFileSync(src,dest);
      return dest;
    } catch {
      return null;
    }
  }

  async apply(id) {
    const proposal=this.list().find(x=>x.id===id);
    if(!proposal) throw new Error('SELF_REPAIR_PROPOSAL_NOT_FOUND');
    if(proposal.status!=='pending') return proposal;

    if(proposal.protectedTarget) {
      return this.engine.updateStatus(id,'blocked',{reason:'PROTECTED_SECURITY_TARGET'});
    }

    const decision=this.policy.evaluate({
      type:'self_repair',
      target:String(proposal.action || ''),
      authorised:true,
      modifiesCoreRules:false,
      disablesPolicyEngine:false,
    });
    if(decision.status==='block') {
      return this.engine.updateStatus(id,'blocked',{reason:decision.reason,ruleIds:decision.ruleIds});
    }

    const win=this.getMainWindow();

    if(proposal.action==='restart_renderer') {
      this.engine.updateStatus(id,'applied',{action:proposal.action});
      win?.reload();
      return this.list().find(x=>x.id===id);
    }

    if(proposal.action==='restart_app') {
      this.engine.updateStatus(id,'applied',{action:proposal.action});
      this.app.relaunch();
      this.app.exit(0);
      return {status:'applied',action:proposal.action};
    }

    if(proposal.action==='clear_browser_cache') {
      await win?.webContents?.session?.clearCache();
      this.engine.updateStatus(id,'applied',{action:proposal.action});
      win?.reload();
      return this.list().find(x=>x.id===id);
    }

    if(proposal.action==='reset_ai_model') {
      const backup=this.backupSettings('reset-ai-model');
      await this.saveSettings({aiModel:'openrouter/auto'});
      return this.engine.updateStatus(id,'applied',{ok:true,action:proposal.action,backup});
    }

    if(proposal.action==='run_verified_update') {
      this.engine.updateStatus(id,'applying',{action:proposal.action});
      const result=await this.oneClickUpdate();
      return this.engine.updateStatus(id,'applied',result);
    }

    if(proposal.action==='create_repair_report') {
      const file=this.engine.writeRepairReport(proposal);
      this.shell.showItemInFolder(file);
      return this.engine.updateStatus(id,'applied',{
        ok:true,
        action:proposal.action,
        file,
        codeExecuted:false,
      });
    }

    return this.engine.updateStatus(id,'applied',{
      ok:true,
      action:'no_action',
      message:'No automatic repair was applied.',
    });
  }

  reject(id) {
    return this.engine.updateStatus(id,'rejected',{reason:'OWNER_REJECTED'});
  }

  async askPermission(proposal) {
    const win=this.getMainWindow();
    if(!win || win.isDestroyed() || !proposal || proposal.status!=='pending') return;

    const codeNote=proposal.requiresCodeChange
      ? '\n\nA hiba forráskód-módosítást igényel. Jarvis javítási csomagot készít, de ellenőrizetlen AI-kódot nem futtat közvetlenül.'
      : '';
    const searchNote=(proposal.findings||[]).length
      ? '\n\nNyilvános technikai találatok: '+String((proposal.findings||[]).length)
      : '';

    const response=await this.dialog.showMessageBox(win,{
      type:'warning',
      title:'Jarvis felügyelt önjavítás',
      message:'Jarvis hibát talált és készített egy javítási tervet.',
      detail:
        String(proposal.summary || '')+
        '\n\nValószínű ok: '+String(proposal.likelyCause || '')+
        '\nJavasolt művelet: '+String(proposal.action || '')+
        '\nBizonyosság: '+String(proposal.confidence || 0)+'%'+
        searchNote+codeNote+
        '\n\nEngedélyezed a javítást?',
      buttons:['Javítás engedélyezése','Később','Elutasítás'],
      defaultId:1,
      cancelId:1,
      noLink:true,
    });

    if(response.response===0) await this.apply(proposal.id);
    else if(response.response===2) this.reject(proposal.id);
  }

  async diagnose(report={}) {
    if(!this.enabled()) return {status:'disabled'};

    const fingerprint=crypto.createHash('sha256')
      .update(String(report.type||'')+'|'+String(report.module||'')+'|'+String(report.message||''))
      .digest('hex');

    const last=this.recentFingerprints.get(fingerprint) || 0;
    if(Date.now()-last < 10*60*1000) return {status:'duplicate_suppressed'};
    this.recentFingerprints.set(fingerprint,Date.now());

    this.appendAudit('self-repair-diagnosis-started',{
      type:String(report.type||'runtime'),
      module:String(report.module||'').slice(0,200),
    });

    try {
      const proposal=await this.engine.diagnose(report);
      if(proposal?.id) {
        this.appendAudit('self-repair-proposal-ready',{
          proposalId:proposal.id,
          action:proposal.action,
          confidence:proposal.confidence,
        });
        setTimeout(()=>this.askPermission(proposal).catch(()=>{}),250);
      }
      return proposal;
    } catch(error) {
      this.appendAudit('self-repair-diagnosis-failed',{
        message:String(error?.message || error).slice(0,1000),
      });
      return {status:'error',message:String(error?.message || error)};
    }
  }
}

module.exports={SelfRepairController};
