'use strict';
const fs=require('fs'); const path=require('path'); const os=require('os');
const { PolicyEngine }=require('../electron/security/policy-engine.cjs');

const forbidden=['@base'+'44','base'+'44'];
const roots=['src','electron','security','package.json','vite.config.js'];
for(const root of roots){
  const p=path.resolve(root); if(!fs.existsSync(p)) continue;
  const stack=[p];
  while(stack.length){
    const cur=stack.pop(); const st=fs.statSync(cur);
    if(st.isDirectory()){ for(const x of fs.readdirSync(cur)) stack.push(path.join(cur,x)); continue; }
    const text=fs.readFileSync(cur,'utf8');
    for(const term of forbidden){ if(text.toLowerCase().includes(term.toLowerCase())) throw new Error(`Forbidden legacy dependency reference in ${cur}`); }
  }
}

const requiredStabilityFiles=[
  'src/components/settings/UpdateCard.jsx',
  'src/components/settings/StabilityCard.jsx',
  'upgrade/Jarvis-OneClick-Upgrade.cmd',
  '.gitattributes',
];
for(const file of requiredStabilityFiles){
  if(!fs.existsSync(path.resolve(file))) throw new Error(`Missing stability/update file: ${file}`);
}
const electronMain=fs.readFileSync(path.resolve('electron/main.cjs'),'utf8');
const preload=fs.readFileSync(path.resolve('electron/preload.cjs'),'utf8');
for(const marker of [
  "jarvis:update:one-click",
  "jarvis:stability:status",
  "jarvis:stability:self-test",
  "jarvis:app:restart",
  "requestSingleInstanceLock",
]) {
  if(!electronMain.includes(marker)) throw new Error(`Missing Electron stability marker: ${marker}`);
}
for(const marker of ['oneClickUpdate','getStabilityStatus','runStabilitySelfTest','restartApp']) {
  if(!preload.includes(marker)) throw new Error(`Missing preload stability bridge: ${marker}`);
}

const policy=new PolicyEngine({
  rulesPath:path.resolve('security/core-rules.json'), signaturePath:path.resolve('security/core-rules.sig'),
  publicKeyPath:path.resolve('security/core-rules-public.pem'), auditPath:path.join(os.tmpdir(),'jarvis-verify-audit.jsonl')
});
if(!policy.getPublicRules().integrityOk) throw new Error('Core rules signature invalid');
if(policy.requestOverride({ruleId:'RULE-04',pin:'0000',action:{}}).ok) throw new Error('Core rule override unexpectedly succeeded');
console.log(`Jarvis verification OK: ${policy.getPublicRules().rules.length} signed rules, legacy platform dependency absent, updater/stability pack present.`);
