'use strict';

const path = require('path');
const AdmZip = require('adm-zip');

const MAX_FILES = 300;
const MAX_ENTRY_BYTES = 512 * 1024;
const MAX_TEXT_BYTES = 3 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  '.txt','.md','.markdown','.json','.jsonl','.js','.jsx','.mjs','.cjs','.ts','.tsx',
  '.css','.scss','.html','.htm','.xml','.yml','.yaml','.toml','.ini','.env','.properties',
  '.py','.java','.kt','.kts','.c','.h','.cpp','.hpp','.cs','.go','.rs','.php','.rb','.sh',
  '.ps1','.bat','.cmd','.sql','.graphql','.gql','.vue','.svelte','.gradle','.gitignore'
]);

function decodeDataUrl(value) {
  const text = String(value || '');
  const match = text.match(/^data:([^;,]*)(;base64)?,(.*)$/s);
  if (!match) throw new Error('FILE_ANALYSIS_LOCAL_DATA_REQUIRED');
  const mime = match[1] || 'application/octet-stream';
  const buffer = match[2]
    ? Buffer.from(match[3], 'base64')
    : Buffer.from(decodeURIComponent(match[3]), 'utf8');
  return { mime, buffer };
}

function safeName(file, index=0) {
  return String(file?.name || file?.filename || ('attachment-' + (index + 1))).replace(/[\\/]+/g, '_');
}

function looksText(name, mime='') {
  const ext = path.extname(String(name || '')).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || /^text\//i.test(mime) || /json|xml|javascript|typescript|yaml/i.test(mime);
}

function decodeText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let zeros = 0;
  for (const byte of sample) if (byte === 0) zeros += 1;
  if (sample.length && zeros / sample.length > 0.02) return null;
  return buffer.toString('utf8').replace(/\u0000/g, '');
}

function stripXml(xml) {
  return String(xml || '')
    .replace(/<w:tab\s*\/>/g, '\t')
    .replace(/<w:br\s*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function zipAnalysis(name, buffer, kind='archive') {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory).slice(0, MAX_FILES);
  const listed = entries.map((entry) => entry.entryName);
  const extracted = [];
  let used = 0;

  for (const entry of entries) {
    if (used >= MAX_TEXT_BYTES) break;
    const entryName = String(entry.entryName || '');
    if (!looksText(entryName)) continue;
    const declaredSize = Number(entry.header?.size || 0);
    if (declaredSize > MAX_ENTRY_BYTES) continue;
    const data = entry.getData();
    if (data.length > MAX_ENTRY_BYTES) continue;
    const text = decodeText(data);
    if (text == null) continue;
    const remaining = MAX_TEXT_BYTES - used;
    const clipped = Buffer.byteLength(text, 'utf8') > remaining
      ? Buffer.from(text, 'utf8').subarray(0, remaining).toString('utf8')
      : text;
    extracted.push({ path:entryName, content:clipped });
    used += Buffer.byteLength(clipped, 'utf8');
  }

  return {
    name,
    kind,
    total_files: entries.length,
    listed_files: listed,
    extracted_files: extracted,
    truncated: entries.length >= MAX_FILES || used >= MAX_TEXT_BYTES
  };
}

function docxAnalysis(name, buffer) {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry('word/document.xml');
  const text = entry ? stripXml(entry.getData().toString('utf8')) : '';
  return {
    name,
    kind:'document',
    total_files:1,
    listed_files:[name],
    extracted_files:text ? [{ path:name, content:text.slice(0, MAX_TEXT_BYTES) }] : [],
    truncated:text.length > MAX_TEXT_BYTES
  };
}

function analyzeOne(file, index=0) {
  const name = safeName(file,index);
  const source = file?.file_url || file?.url;
  const { mime, buffer } = decodeDataUrl(source);
  const ext = path.extname(name).toLowerCase();

  if (buffer.length > 50 * 1024 * 1024) throw new Error('FILE_ANALYSIS_FILE_TOO_LARGE:' + name);
  if (ext === '.zip') return zipAnalysis(name, buffer, file?.kind || 'archive');
  if (ext === '.docx') return docxAnalysis(name, buffer);

  if (looksText(name, mime)) {
    const text = decodeText(buffer);
    return {
      name,
      kind:file?.kind || 'code',
      total_files:1,
      listed_files:[name],
      extracted_files:text == null ? [] : [{ path:name, content:text.slice(0, MAX_TEXT_BYTES) }],
      truncated:text != null && text.length > MAX_TEXT_BYTES
    };
  }

  return {
    name,
    kind:file?.kind || 'document',
    total_files:1,
    listed_files:[name],
    extracted_files:[],
    unsupported:true,
    reason:'No safe local text extractor is available for this file type.'
  };
}

function analyzeUploadedFiles(files=[]) {
  if (!Array.isArray(files) || files.length === 0) return { analyses:[] };
  const analyses = [];
  for (let i=0; i<Math.min(files.length, 10); i+=1) {
    try {
      analyses.push(analyzeOne(files[i],i));
    } catch (error) {
      analyses.push({
        name:safeName(files[i],i),
        kind:files[i]?.kind || 'unknown',
        total_files:0,
        listed_files:[],
        extracted_files:[],
        error:error?.message || String(error)
      });
    }
  }
  return { analyses };
}

function flatten(analyses) {
  const entries=[];
  for (const analysis of analyses) {
    for (const file of analysis.extracted_files || []) entries.push(file);
  }
  return entries;
}

function detectStack(entries) {
  const names=entries.map((e)=>e.path.toLowerCase());
  const text=entries.map((e)=>e.content).join('\n').slice(0, 2_000_000);
  const stack=new Set();
  if(names.some((n)=>/package\.json$/.test(n))) stack.add('Node.js');
  if(/\breact\b/i.test(text) || names.some((n)=>/\.(jsx|tsx)$/.test(n))) stack.add('React');
  if(/\belectron\b/i.test(text)) stack.add('Electron');
  if(names.some((n)=>/requirements\.txt$|pyproject\.toml$|\.py$/.test(n))) stack.add('Python');
  if(names.some((n)=>/\.java$|build\.gradle/.test(n))) stack.add('Java/Gradle');
  if(names.some((n)=>/\.csproj$|\.cs$/.test(n))) stack.add('.NET');
  if(names.some((n)=>/dockerfile$|docker-compose/.test(n))) stack.add('Docker');
  return [...stack];
}

function structure(entries) {
  const counts=new Map();
  for(const entry of entries){
    const normalized=String(entry.path||'').replace(/\\/g,'/');
    const top=normalized.includes('/') ? normalized.split('/')[0] : '(root)';
    counts.set(top,(counts.get(top)||0)+1);
  }
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([folder,count])=>({folder,count}));
}

function deepReport(files=[]) {
  const { analyses }=analyzeUploadedFiles(files);
  const entries=flatten(analyses);
  const allNames=analyses.flatMap((a)=>a.listed_files||[]);
  const allText=entries.map((e)=>e.content).join('\n');
  const issues=[];

  const envFiles=allNames.filter((n)=>/(^|\/)\.env(\.|$)/i.test(n));
  if(envFiles.length) issues.push({severity:'high',title:'Environment/secrets file present',detail:envFiles.slice(0,5).join(', ')});

  const suspiciousSecrets=(allText.match(/(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{8,}['"]/gi)||[]).length;
  if(suspiciousSecrets) issues.push({severity:'high',title:'Potential embedded secrets',detail:suspiciousSecrets+' secret-like assignment(s) detected. Review before publishing.'});

  const todoCount=(allText.match(/\b(?:TODO|FIXME|HACK)\b/g)||[]).length;
  if(todoCount) issues.push({severity:'info',title:'Unresolved maintenance markers',detail:todoCount+' TODO/FIXME/HACK marker(s) detected.'});

  const packageEntry=entries.find((e)=>/package\.json$/i.test(e.path));
  if(packageEntry){
    try {
      const pkg=JSON.parse(packageEntry.content);
      if(!pkg.scripts?.test && !pkg.scripts?.['verify:jarvis']) issues.push({severity:'medium',title:'No automated test command',detail:'package.json does not expose a test/verification script.'});
    } catch {
      issues.push({severity:'medium',title:'Invalid package.json',detail:'package.json could not be parsed as JSON.'});
    }
  }

  const unsupported=analyses.filter((a)=>a.unsupported||a.error);
  if(unsupported.length) issues.push({severity:'info',title:'Partially unreadable attachments',detail:unsupported.map((a)=>a.name).join(', ')});

  const recommendations=[];
  if(envFiles.length||suspiciousSecrets) recommendations.push('Remove or rotate secrets before sharing/building the project.');
  if(packageEntry) recommendations.push('Run syntax, unit, build and packaged-startup checks in CI before release.');
  if(unsupported.length) recommendations.push('Use ZIP/source text for files that need deep local analysis.');
  if(!recommendations.length) recommendations.push('No high-confidence static red flags found in the readable subset; continue with build/runtime tests.');

  return {
    summary:{
      file_count:allNames.length,
      readable_file_count:entries.length,
      stack:detectStack(entries),
      structure:structure(entries)
    },
    issues,
    recommendations,
    analyses
  };
}

function specialistReport(files=[]) {
  const report=deepReport(files);
  const entries=flatten(report.analyses);
  const names=report.analyses.flatMap((a)=>a.listed_files||[]);
  const text=entries.map((e)=>e.content).join('\n');
  const categories=[];

  const securityFindings=[];
  let securityScore=100;
  if(names.some((n)=>/(^|\/)\.env(\.|$)/i.test(n))){ securityScore-=35; securityFindings.push('Environment/secrets file is included.'); }
  const secretCount=(text.match(/(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{8,}['"]/gi)||[]).length;
  if(secretCount){ securityScore-=Math.min(40,secretCount*10); securityFindings.push(secretCount+' secret-like assignment(s) detected.'); }
  if(/\beval\s*\(/.test(text)){ securityScore-=15; securityFindings.push('eval(...) usage detected.'); }
  categories.push({title:'Security',score:Math.max(0,securityScore),findings:securityFindings,suggestions:securityFindings.length?['Review the concrete findings before release.']:['No high-confidence security pattern detected in readable text.']});

  const reliabilityFindings=[];
  let reliabilityScore=100;
  const packageEntry=entries.find((e)=>/package\.json$/i.test(e.path));
  if(packageEntry){
    try{
      const pkg=JSON.parse(packageEntry.content);
      if(!pkg.scripts?.test){ reliabilityScore-=15; reliabilityFindings.push('No package.json test script.'); }
      if(!pkg.scripts?.build){ reliabilityScore-=20; reliabilityFindings.push('No package.json build script.'); }
    }catch{ reliabilityScore-=35; reliabilityFindings.push('package.json is invalid JSON.'); }
  } else { reliabilityScore-=10; reliabilityFindings.push('No package.json found in readable project files.'); }
  if(!names.some((n)=>/(^|\/)(test|tests|__tests__)(\/|$)|\.test\.|\.spec\./i.test(n))){ reliabilityScore-=15; reliabilityFindings.push('No test files detected.'); }
  categories.push({title:'Reliability',score:Math.max(0,reliabilityScore),findings:reliabilityFindings,suggestions:['Run tests, production build and packaged startup smoke test.']});

  const maintainFindings=[];
  let maintainScore=100;
  const huge=entries.filter((e)=>String(e.content||'').split('\n').length>1500);
  if(huge.length){ maintainScore-=Math.min(30,huge.length*10); maintainFindings.push(huge.length+' source file(s) exceed 1500 lines.'); }
  const markers=(text.match(/\b(?:TODO|FIXME|HACK)\b/g)||[]).length;
  if(markers>20){ maintainScore-=20; maintainFindings.push(markers+' maintenance markers detected.'); }
  categories.push({title:'Maintainability',score:Math.max(0,maintainScore),findings:maintainFindings,suggestions:maintainFindings.length?['Split oversized modules and resolve tracked maintenance debt.']:['No large maintainability warning detected by the local heuristic.']});

  return {
    file_count:report.summary.file_count,
    readable_file_count:report.summary.readable_file_count,
    categories,
    measured:true,
    note:'Scores are deterministic static heuristics from the supplied files, not a hard-coded self-rating.'
  };
}

module.exports = {
  analyzeUploadedFiles,
  analyzeProjectDeep: deepReport,
  analyzeProjectSpecialists: specialistReport,
};
