'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROTECTED = [
  /^electron[\\/]security[\\/]/i,
  /^security[\\/]/i,
  /^electron[\\/]main\.cjs$/i,
  /^electron[\\/]developer-repair\.cjs$/i,
  /^\.github[\\/]workflows[\\/]/i,
];
const ALLOWED_EXT = new Set(['.js','.jsx','.cjs','.mjs','.ts','.tsx','.json','.css','.md']);

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+stable(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function proposalHash(plan) {
  return crypto.createHash('sha256').update(stable(plan)).digest('hex');
}
function normalizeRelative(input) {
  const rel = String(input || '').replace(/\\/g,'/').replace(/^\.\//,'');
  if (!rel || path.isAbsolute(rel) || rel.split('/').includes('..')) throw new Error('DEV_REPAIR_INVALID_PATH');
  if (!ALLOWED_EXT.has(path.extname(rel).toLowerCase())) throw new Error('DEV_REPAIR_FILE_TYPE_BLOCKED');
  if (PROTECTED.some(rx => rx.test(rel))) throw new Error('DEV_REPAIR_PROTECTED_PATH');
  return rel;
}
function resolveInside(root, rel) {
  const base = fs.realpathSync(root);
  const target = path.resolve(base, normalizeRelative(rel));
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error('DEV_REPAIR_PATH_ESCAPE');
  let parent = path.dirname(target);
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  const realParent = fs.realpathSync(parent);
  if (realParent !== base && !realParent.startsWith(base + path.sep)) throw new Error('DEV_REPAIR_SYMLINK_ESCAPE');
  return target;
}
function validateWorkspace(root) {
  const base = fs.realpathSync(root);
  const pkg = JSON.parse(fs.readFileSync(path.join(base,'package.json'),'utf8'));
  if (pkg?.name !== 'jarvis-desktop') throw new Error('DEV_REPAIR_NOT_JARVIS_WORKSPACE');
  return base;
}
function validatePlan(root, input={}) {
  const base = validateWorkspace(root);
  const patches = Array.isArray(input.patches) ? input.patches : [];
  if (!patches.length) throw new Error('DEV_REPAIR_EMPTY_PLAN');
  const clean = patches.map(p => {
    const file = normalizeRelative(p.file);
    resolveInside(base,file);
    if (typeof p.content !== 'string') throw new Error('DEV_REPAIR_CONTENT_REQUIRED');
    return { file, content:p.content };
  });
  const plan = {
    goal:String(input.goal || '').slice(0,4000),
    rationale:String(input.rationale || '').slice(0,8000),
    risk:['low','medium','high'].includes(input.risk) ? input.risk : 'medium',
    patches:clean,
    validation:['syntax','tests','lint','typecheck','verify','build']
  };
  return { ...plan, hash:proposalHash(plan) };
}
function snapshot(root, plan, backupRoot) {
  const dir = path.join(backupRoot, Date.now()+'-'+plan.hash.slice(0,12));
  fs.mkdirSync(dir,{recursive:true});
  const manifest=[];
  for(const patch of plan.patches){
    const target=resolveInside(root,patch.file);
    const existed=fs.existsSync(target);
    const content=existed?fs.readFileSync(target):null;
    const backup=path.join(dir,patch.file);
    if(existed){ fs.mkdirSync(path.dirname(backup),{recursive:true}); fs.writeFileSync(backup,content); }
    manifest.push({file:patch.file,existed});
  }
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
  return dir;
}
function apply(root,plan){
  for(const patch of plan.patches){
    const target=resolveInside(root,patch.file);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    const tmp=target+'.jarvis-tmp-'+process.pid;
    fs.writeFileSync(tmp,patch.content,'utf8');
    fs.renameSync(tmp,target);
  }
}
function rollback(root,dir){
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  for(const item of manifest){
    const target=resolveInside(root,item.file);
    const backup=path.join(dir,item.file);
    if(item.existed){fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(backup,target);}
    else if(fs.existsSync(target)) fs.rmSync(target,{force:true});
  }
}
module.exports={validateWorkspace,validatePlan,proposalHash,snapshot,apply,rollback,PROTECTED};
