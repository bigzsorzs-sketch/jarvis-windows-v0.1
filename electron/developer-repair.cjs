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
function createSandbox(root, plan, sandboxRoot) {
  const base = validateWorkspace(root);
  fs.mkdirSync(sandboxRoot,{recursive:true});
  const dir = path.join(sandboxRoot, Date.now()+'-'+plan.hash.slice(0,12));
  const ignored = new Set(['.git','release','dist','.jarvis-sandbox']);
  fs.cpSync(base,dir,{recursive:true,filter:(source)=>{
    const rel=path.relative(base,source).replace(/\\/g,'/');
    if(!rel) return true;
    const first=rel.split('/')[0];
    return !ignored.has(first) && first !== 'node_modules';
  }});
  const sourceModules=path.join(base,'node_modules');
  const sandboxModules=path.join(dir,'node_modules');
  if(fs.existsSync(sourceModules)){
    try { fs.symlinkSync(sourceModules,sandboxModules,process.platform==='win32'?'junction':'dir'); }
    catch { fs.cpSync(sourceModules,sandboxModules,{recursive:true}); }
  }
  apply(dir,plan);
  fs.writeFileSync(path.join(dir,'.jarvis-sandbox.json'),JSON.stringify({
    hash:plan.hash, source:base, createdAt:new Date().toISOString(), files:plan.patches.map(p=>p.file)
  },null,2));
  return dir;
}
function destroySandbox(dir, sandboxRoot) {
  if(!dir || !sandboxRoot) return;
  const base=path.resolve(sandboxRoot);
  const target=path.resolve(dir);
  if(target===base || !target.startsWith(base+path.sep)) throw new Error('DEV_REPAIR_SANDBOX_PATH_INVALID');
  fs.rmSync(target,{recursive:true,force:true});
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

const INSPECT_IGNORED = new Set(['.git','node_modules','release','dist','coverage','.jarvis-sandbox']);
const INSPECT_EXT = new Set(['.js','.jsx','.cjs','.mjs','.ts','.tsx','.json','.css','.md']);

function inspectRoot(root) {
  const base = fs.realpathSync(root);
  const pkgPath = path.join(base,'package.json');
  if (!fs.existsSync(pkgPath)) throw new Error('SELF_REPAIR_PACKAGE_NOT_FOUND');
  const pkg = JSON.parse(fs.readFileSync(pkgPath,'utf8'));
  if (pkg?.name !== 'jarvis-desktop') throw new Error('SELF_REPAIR_NOT_JARVIS');
  return { base, pkg };
}

function listProjectFiles(root) {
  const { base } = inspectRoot(root);
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      if (INSPECT_IGNORED.has(entry.name)) continue;
      const full = path.join(dir,entry.name);
      const rel = path.relative(base,full).replace(/\\/g,'/');
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!INSPECT_EXT.has(ext)) continue;
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.size > 800000) continue;
      files.push({ path:rel, full, ext, size:stat.size });
      if (files.length >= 1800) return;
    }
  };
  visit(base);
  return files;
}

function sourceMeta(file) {
  let content = '';
  try { content = fs.readFileSync(file.full,'utf8'); } catch {}
  const imports = [];
  const importRx = /(?:from\s+|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRx.exec(content)) && imports.length < 40) imports.push(match[1]);
  const lines = content ? content.split(/\r?\n/).length : 0;
  const todoCount = (content.match(/\b(?:TODO|FIXME|HACK)\b/g)||[]).length;
  const hardcodedUi = (content.match(/>\s*[A-ZÁÉÍÓÖŐÚÜŰ][^<{]{4,80}</g)||[]).length;
  return { ...file, lines, imports:[...new Set(imports)], todoCount, hardcodedUi, content };
}

function inspectWorkspace(root) {
  const { base, pkg } = inspectRoot(root);
  const metas = listProjectFiles(base).map(sourceMeta);
  const source = metas.filter(f => /\.(?:js|jsx|cjs|mjs|ts|tsx)$/.test(f.ext));
  const tests = metas.filter(f => /(^|\/)(?:test|tests|__tests__)(\/|$)|\.(?:test|spec)\./i.test(f.path));
  const directories = {};
  for (const file of metas) {
    const top = file.path.split('/')[0] || '.';
    directories[top] = (directories[top] || 0) + 1;
  }
  const findings = [];
  const huge = source.filter(f => f.lines > 1200).sort((a,b)=>b.lines-a.lines).slice(0,12);
  if (huge.length) findings.push({
    severity:'medium',
    type:'maintainability',
    title:'Nagy forrásfájlok',
    detail:huge.map(f=>`${f.path} (${f.lines} sor)`).join(', ')
  });
  const todoFiles = source.filter(f => f.todoCount > 0).sort((a,b)=>b.todoCount-a.todoCount).slice(0,12);
  if (todoFiles.length) findings.push({
    severity:'info',
    type:'maintenance',
    title:'Karbantartási jelölések',
    detail:todoFiles.map(f=>`${f.path}: ${f.todoCount}`).join(', ')
  });
  const uiHardcoded = source.filter(f => f.hardcodedUi > 6).sort((a,b)=>b.hardcodedUi-a.hardcodedUi).slice(0,10);
  if (uiHardcoded.length) findings.push({
    severity:'medium',
    type:'localization',
    title:'Valószínű hard-coded UI szövegek',
    detail:uiHardcoded.map(f=>`${f.path}: ${f.hardcodedUi}`).join(', ')
  });
  if (!tests.length) findings.push({ severity:'high', type:'reliability', title:'Nincsenek tesztek', detail:'A projektben nem található automatikus teszt.' });

  const imports = source.reduce((sum,f)=>sum+f.imports.length,0);
  return {
    root:base,
    package:{ name:pkg.name, version:pkg.version, main:pkg.main || null },
    summary:{
      files:metas.length,
      sourceFiles:source.length,
      tests:tests.length,
      imports,
      directories
    },
    findings,
    files:metas.map(({content,full,...file})=>file)
  };
}

function queryTokens(query='') {
  return [...new Set(String(query).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9_/-]+/).filter(t=>t.length>=3))].slice(0,24);
}

function buildDiagnosticContext(root, query='', options={}) {
  const inspection = inspectWorkspace(root);
  const tokens = queryTokens(query);
  const maxFiles = Math.max(3,Math.min(14,Number(options.maxFiles)||10));
  const candidates = listProjectFiles(root).map(sourceMeta).filter(f => f.content);
  const scored = candidates.map(file => {
    const hay = (file.path+'\n'+file.content.slice(0,100000)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    let score = /src\/pages|src\/components|src\/lib|electron\//.test(file.path) ? 2 : 0;
    for (const token of tokens) {
      if (file.path.toLowerCase().includes(token)) score += 10;
      const occurrences = hay.split(token).length - 1;
      score += Math.min(occurrences,8);
    }
    if (/package\.json$|src\/App\.jsx$|src\/components\/Layout\.jsx$|electron\/main\.cjs$/.test(file.path)) score += 3;
    return { file, score };
  }).sort((a,b)=>b.score-a.score);

  const selected = scored.filter(item=>item.score>0).slice(0,maxFiles);
  if (!selected.length) selected.push(...scored.slice(0,Math.min(6,maxFiles)));

  let budget = Number(options.maxChars)||36000;
  const excerpts=[];
  for (const {file,score} of selected) {
    if (budget <= 0) break;
    const excerpt = file.content.slice(0,Math.min(9000,budget));
    budget -= excerpt.length;
    excerpts.push({
      path:file.path,
      score,
      lines:file.lines,
      imports:file.imports.slice(0,20),
      excerpt
    });
  }
  return {
    map:{
      package:inspection.package,
      summary:inspection.summary,
      findings:inspection.findings,
      topFiles:inspection.files.sort((a,b)=>b.lines-a.lines).slice(0,20)
    },
    excerpts
  };
}

module.exports={
  validateWorkspace,validatePlan,proposalHash,snapshot,apply,createSandbox,destroySandbox,rollback,
  inspectWorkspace,buildDiagnosticContext,PROTECTED
};
