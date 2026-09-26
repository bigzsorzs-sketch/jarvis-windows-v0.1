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
const policy=new PolicyEngine({
  rulesPath:path.resolve('security/core-rules.json'), signaturePath:path.resolve('security/core-rules.sig'),
  publicKeyPath:path.resolve('security/core-rules-public.pem'), auditPath:path.join(os.tmpdir(),'jarvis-verify-audit.jsonl')
});
if(!policy.getPublicRules().integrityOk) throw new Error('Core rules signature invalid');
if(policy.requestOverride({ruleId:'RULE-04',pin:'0000',action:{}}).ok) throw new Error('Core rule override unexpectedly succeeded');
console.log(`Jarvis verification OK: ${policy.getPublicRules().rules.length} signed rules, legacy platform dependency absent.`);
