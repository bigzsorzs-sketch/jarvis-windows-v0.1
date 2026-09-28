'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROTECTED = [
  /^electron[\\/]security[\\/]/i,
  /^security[\\/]/i,
  /^electron[\\/]main\.cjs$/i,
  /^electron[\\/]developer-repair\.cjs$/i,
  /^electron[\\/]admin-diagnostics\.cjs$/i,
  /^\.github[\\/]workflows[\\/]/i,
  /^scripts[\\/]/i,
  /^package\.json$/i,
  /^package-lock\.json$/i,
  /^eslint\.config\.js$/i,
  /^tsconfig\.json$/i,
  /^vite\.config\.js$/i,
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
  if (PROTECTED.some(rx => rx.test(rel))) throw new Error('DEV_REPAIR_PROTECTED_PATH');
  if (!ALLOWED_EXT.has(path.extname(rel).toLowerCase())) throw new Error('DEV_REPAIR_FILE_TYPE_BLOCKED');
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
  if (patches.length > 8) throw new Error('DEV_REPAIR_TOO_MANY_PATCHES');

  const clean = patches.map((p) => {
    const file = normalizeRelative(p.file);
    const target = resolveInside(base,file);
    if (/^src[\\/]tests[\\/]/i.test(file) && fs.existsSync(target)) {
      throw new Error('DEV_REPAIR_EXISTING_TEST_PROTECTED');
    }
    const hasFullContent = typeof p.content === 'string';
    const replacements = Array.isArray(p.replacements) ? p.replacements : [];

    if (!hasFullContent && !replacements.length) throw new Error('DEV_REPAIR_PATCH_REQUIRED');
    if (hasFullContent && Buffer.byteLength(p.content,'utf8') > 900000) throw new Error('DEV_REPAIR_CONTENT_TOO_LARGE');
    if (replacements.length > 12) throw new Error('DEV_REPAIR_TOO_MANY_REPLACEMENTS');

    const cleanReplacements = replacements.map((edit) => {
      const search = String(edit?.search || '');
      const replace = String(edit?.replace ?? '');
      if (!search) throw new Error('DEV_REPAIR_SEARCH_REQUIRED');
      if (search.length > 50000 || replace.length > 100000) throw new Error('DEV_REPAIR_REPLACEMENT_TOO_LARGE');
      return { search, replace, all:edit?.all === true };
    });

    if (cleanReplacements.length && !fs.existsSync(target)) throw new Error('DEV_REPAIR_REPLACEMENT_TARGET_MISSING');
    return hasFullContent
      ? { file, content:p.content }
      : { file, replacements:cleanReplacements };
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
    let nextContent;

    if (typeof patch.content === 'string') {
      nextContent = patch.content;
    } else {
      let current = fs.readFileSync(target,'utf8');
      for (const edit of patch.replacements || []) {
        const occurrences = current.split(edit.search).length - 1;
        if (occurrences < 1) throw new Error('DEV_REPAIR_SEARCH_NOT_FOUND:' + patch.file);
        if (!edit.all && occurrences !== 1) throw new Error('DEV_REPAIR_SEARCH_AMBIGUOUS:' + patch.file);
        current = edit.all ? current.split(edit.search).join(edit.replace) : current.replace(edit.search,edit.replace);
      }
      nextContent = current;
    }

    const tmp=target+'.jarvis-tmp-'+process.pid;
    fs.writeFileSync(tmp,nextContent,'utf8');
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
  if(!dir || !sandboxRoot) return { removed:false, skipped:true };
  const base=path.resolve(sandboxRoot);
  const target=path.resolve(dir);
  if(target===base || !target.startsWith(base+path.sep)) throw new Error('DEV_REPAIR_SANDBOX_PATH_INVALID');
  if(!fs.existsSync(target)) return { removed:true, alreadyMissing:true };

  // Windows can keep a sandbox directory locked briefly after npm/node exits,
  // especially when node_modules is a junction. Remove the junction first and
  // use bounded retries so a successful repair is not reported as failed only
  // because cleanup raced a released file handle.
  const sandboxModules=path.join(target,'node_modules');
  try {
    if(fs.existsSync(sandboxModules)) fs.rmSync(sandboxModules,{recursive:true,force:true,maxRetries:4,retryDelay:120});
  } catch {}

  try {
    fs.rmSync(target,{recursive:true,force:true,maxRetries:8,retryDelay:180});
    return { removed:true };
  } catch(error) {
    if(!['EPERM','EBUSY','ENOTEMPTY','EACCES'].includes(error?.code)) throw error;
    try { fs.chmodSync(target,0o700); } catch {}
    try {
      fs.rmSync(target,{recursive:true,force:true,maxRetries:8,retryDelay:220});
      return { removed:true, retried:true };
    } catch(secondError) {
      if(!['EPERM','EBUSY','ENOTEMPTY','EACCES'].includes(secondError?.code)) throw secondError;
      const quarantine=target+`.pending-delete-${Date.now()}`;
      try {
        fs.renameSync(target,quarantine);
        return { removed:false, deferred:true, quarantine };
      } catch {
        // Cleanup failure must not invalidate an otherwise verified repair.
        // The next run uses a unique sandbox path and can retry stale cleanup.
        return { removed:false, deferred:true, quarantine:null };
      }
    }
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

function resolveModulePath(fromPath, spec, known) {
  if (!spec || (!spec.startsWith('.') && !spec.startsWith('@/'))) return null;
  const base = spec.startsWith('@/')
    ? 'src/' + spec.slice(2)
    : path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), spec));
  const candidates = [
    base,
    base + '.js', base + '.jsx', base + '.cjs', base + '.mjs', base + '.ts', base + '.tsx',
    base + '/index.js', base + '/index.jsx', base + '/index.ts', base + '/index.tsx'
  ];
  return candidates.find((candidate) => known.has(candidate)) || null;
}

function buildArchitecture(metas) {
  const known = new Set(metas.map((file) => file.path));
  const byPath = new Map(metas.map((file) => [file.path, file]));
  const dependencies = {};
  const dependents = {};
  for (const file of metas) {
    const resolved = file.imports.map((spec) => resolveModulePath(file.path, spec, known)).filter(Boolean);
    dependencies[file.path] = [...new Set(resolved)];
    for (const target of dependencies[file.path]) {
      if (!dependents[target]) dependents[target] = [];
      dependents[target].push(file.path);
    }
  }

  const walk = (roots) => {
    const visited = new Set();
    const queue = roots.filter((root) => known.has(root));
    while (queue.length) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      for (const next of dependencies[current] || []) if (!visited.has(next)) queue.push(next);
    }
    return visited;
  };

  const rendererReachable = walk(['src/App.jsx']);
  const mainReachable = walk(['electron/main.cjs']);
  const routes = [];
  const appSource = byPath.get('src/App.jsx')?.content || '';
  const componentImports = new Map();
  const staticImportRx = /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g;
  const lazyImportRx = /const\s+([A-Za-z_$][\w$]*)\s*=\s*lazy\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g;
  let match;
  while ((match = staticImportRx.exec(appSource))) componentImports.set(match[1], match[2]);
  while ((match = lazyImportRx.exec(appSource))) componentImports.set(match[1], match[2]);
  const routeRx = /<Route\s+path=["']([^"']+)["']\s+element=\{<([A-Za-z_$][\w$]*)/g;
  while ((match = routeRx.exec(appSource))) {
    const spec = componentImports.get(match[2]) || null;
    routes.push({
      route:match[1],
      component:match[2],
      file:spec ? resolveModulePath('src/App.jsx', spec, known) : null
    });
  }

  const rendererChannels = new Map();
  const mainChannels = new Map();
  for (const file of metas) {
    if (!file.content) continue;
    const invokeRx = /ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g;
    const handleRx = /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g;
    while ((match = invokeRx.exec(file.content))) {
      if (!rendererChannels.has(match[1])) rendererChannels.set(match[1], []);
      rendererChannels.get(match[1]).push(file.path);
    }
    while ((match = handleRx.exec(file.content))) {
      if (!mainChannels.has(match[1])) mainChannels.set(match[1], []);
      mainChannels.get(match[1]).push(file.path);
    }
  }
  const channelNames = [...new Set([...rendererChannels.keys(), ...mainChannels.keys()])].sort();
  const ipc = channelNames.map((channel) => ({
    channel,
    renderer:rendererChannels.get(channel) || [],
    main:mainChannels.get(channel) || [],
    connected:rendererChannels.has(channel) && mainChannels.has(channel)
  }));

  const reachability = {};
  for (const file of metas) {
    const test = /(^|\/)(?:test|tests|__tests__)(\/|$)|\.(?:test|spec)\./i.test(file.path);
    const renderer = rendererReachable.has(file.path);
    const main = mainReachable.has(file.path);
    reachability[file.path] = test ? 'test'
      : renderer && main ? 'renderer+main'
      : renderer ? 'renderer-active'
      : main ? 'main-active'
      : 'inactive-or-unreferenced';
  }

  return {
    dependencies,
    dependents,
    routes,
    ipc,
    reachability,
    rendererReachableCount:rendererReachable.size,
    mainReachableCount:mainReachable.size
  };
}

function inspectWorkspace(root) {
  const { base, pkg } = inspectRoot(root);
  const metas = listProjectFiles(base).map(sourceMeta);
  const source = metas.filter((file) => /\.(?:js|jsx|cjs|mjs|ts|tsx)$/.test(file.ext));
  const tests = metas.filter((file) => /(^|\/)(?:test|tests|__tests__)(\/|$)|\.(?:test|spec)\./i.test(file.path));
  const architecture = buildArchitecture(metas);
  const directories = {};
  for (const file of metas) {
    const top = file.path.split('/')[0] || '.';
    directories[top] = (directories[top] || 0) + 1;
  }

  const findings = [];
  const huge = source.filter((file) => file.lines > 1200).sort((a,b) => b.lines - a.lines).slice(0,12);
  if (huge.length) findings.push({
    severity:'medium',
    type:'maintainability',
    title:'Nagy forrásfájlok',
    detail:huge.map((file) => `${file.path} (${file.lines} sor)`).join(', ')
  });
  const todoFiles = source.filter((file) => file.todoCount > 0).sort((a,b) => b.todoCount - a.todoCount).slice(0,12);
  if (todoFiles.length) findings.push({
    severity:'info',
    type:'maintenance',
    title:'Karbantartási jelölések',
    detail:todoFiles.map((file) => `${file.path}: ${file.todoCount}`).join(', ')
  });
  const uiHardcoded = source.filter((file) => file.hardcodedUi > 6).sort((a,b) => b.hardcodedUi - a.hardcodedUi).slice(0,10);
  if (uiHardcoded.length) findings.push({
    severity:'medium',
    type:'localization',
    title:'Valószínű hard-coded UI szövegek',
    detail:uiHardcoded.map((file) => `${file.path}: ${file.hardcodedUi}`).join(', ')
  });
  const disconnectedIpc = architecture.ipc.filter((item) => !item.connected).slice(0,20);
  if (disconnectedIpc.length) findings.push({
    severity:'medium',
    type:'ipc',
    title:'Egyoldalú IPC csatornák',
    detail:disconnectedIpc.map((item) => item.channel).join(', ')
  });
  if (!tests.length) findings.push({ severity:'high', type:'reliability', title:'Nincsenek tesztek', detail:'A projektben nem található automatikus teszt.' });

  const imports = source.reduce((sum,file) => sum + file.imports.length, 0);
  const decoratedFiles = metas.map(({content,full,...file}) => ({
    ...file,
    reachability:architecture.reachability[file.path] || 'unknown',
    dependencies:architecture.dependencies[file.path] || [],
    dependents:architecture.dependents[file.path] || []
  }));
  return {
    root:base,
    package:{ name:pkg.name, version:pkg.version, main:pkg.main || null },
    summary:{
      files:metas.length,
      sourceFiles:source.length,
      tests:tests.length,
      imports,
      rendererReachable:architecture.rendererReachableCount,
      mainReachable:architecture.mainReachableCount,
      routes:architecture.routes.length,
      ipcChannels:architecture.ipc.length,
      directories
    },
    findings,
    architecture:{
      routes:architecture.routes,
      ipc:architecture.ipc,
      reachability:architecture.reachability
    },
    files:decoratedFiles
  };
}

function queryTokens(query='') {
  return [...new Set(String(query).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9_/-]+/).filter((token) => token.length >= 3))].slice(0,24);
}

function buildDiagnosticContext(root, query='', options={}) {
  const inspection = inspectWorkspace(root);
  const tokens = queryTokens(query);
  const maxFiles = Math.max(5,Math.min(24,Number(options.maxFiles)||14));
  const candidates = listProjectFiles(root).map(sourceMeta).filter((file) => file.content);
  const known = new Map(candidates.map((file) => [file.path,file]));
  const architecture = buildArchitecture(candidates);

  const scored = candidates.map((file) => {
    const hay = (file.path + '\n' + file.content.slice(0,120000)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    let score = /src\/pages|src\/components|src\/lib|electron\//.test(file.path) ? 2 : 0;
    const reach = architecture.reachability[file.path];
    if (reach === 'renderer-active' || reach === 'main-active' || reach === 'renderer+main') score += 4;
    for (const token of tokens) {
      if (file.path.toLowerCase().includes(token)) score += 12;
      score += Math.min(hay.split(token).length - 1, 10);
    }
    if (/package\.json$|src\/App\.jsx$|src\/components\/Layout\.jsx$|electron\/main\.cjs$|electron\/preload\.cjs$/.test(file.path)) score += 3;
    return { file, score };
  }).sort((a,b) => b.score - a.score);

  const selectedPaths = [];
  const addPath = (filePath) => {
    if (filePath && known.has(filePath) && !selectedPaths.includes(filePath) && selectedPaths.length < maxFiles) selectedPaths.push(filePath);
  };

  for (const item of scored) {
    if (item.score <= 0 && selectedPaths.length >= 6) break;
    addPath(item.file.path);
    if (selectedPaths.length >= Math.min(8,maxFiles)) break;
  }

  const seedPaths = [...selectedPaths];
  for (const filePath of seedPaths) {
    for (const dep of architecture.dependencies[filePath] || []) addPath(dep);
    for (const parent of architecture.dependents[filePath] || []) addPath(parent);
  }

  const queryLower = String(query).toLowerCase();
  if (/ipc|electron|preload|bridge|háttér|hatter|jogosults|rendszer/.test(queryLower)) {
    addPath('electron/main.cjs');
    addPath('electron/preload.cjs');
  }
  if (/route|útvonal|utvonal|menü|menu|oldal|page/.test(queryLower)) {
    addPath('src/App.jsx');
    addPath('src/components/Layout.jsx');
  }

  let budget = Number(options.maxChars) || 52000;
  const excerpts = [];
  for (const filePath of selectedPaths) {
    if (budget <= 0) break;
    const file = known.get(filePath);
    const excerpt = file.content.slice(0,Math.min(10000,budget));
    budget -= excerpt.length;
    excerpts.push({
      path:file.path,
      score:scored.find((item) => item.file.path === file.path)?.score || 0,
      lines:file.lines,
      imports:file.imports.slice(0,24),
      dependencies:architecture.dependencies[file.path] || [],
      dependents:architecture.dependents[file.path] || [],
      reachability:architecture.reachability[file.path] || 'unknown',
      routes:inspection.architecture.routes.filter((route) => route.file === file.path),
      ipc:inspection.architecture.ipc.filter((item) => item.renderer.includes(file.path) || item.main.includes(file.path)),
      excerpt
    });
  }

  return {
    map:{
      package:inspection.package,
      summary:inspection.summary,
      findings:inspection.findings,
      architecture:{
        routes:inspection.architecture.routes,
        ipc:inspection.architecture.ipc.slice(0,120)
      },
      topFiles:inspection.files.sort((a,b) => b.lines - a.lines).slice(0,24)
    },
    excerpts
  };
}

module.exports={
  validateWorkspace,validatePlan,proposalHash,snapshot,apply,createSandbox,destroySandbox,rollback,
  inspectWorkspace,buildDiagnosticContext,PROTECTED
};
