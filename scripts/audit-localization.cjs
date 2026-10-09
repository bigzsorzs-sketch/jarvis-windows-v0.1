'use strict';
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const root = path.resolve(__dirname, '..');
const parse = file => parser.parse(fs.readFileSync(file, 'utf8'), {sourceType:'unambiguous', plugins:['jsx','typescript']});
function inventory() {
  const languages = [], catalogs = {};
  traverse(parse(path.join(root,'src/lib/i18n.jsx')), {VariableDeclarator(p) {
    if (p.node.id.name === 'SUPPORTED_LANGUAGES') for (const item of p.node.init.elements) languages.push(Object.fromEntries(item.properties.map(x=>[x.key.name,x.value.value])));
    if (p.node.id.name === 'translations') for (const lang of p.node.init.properties) {
      const values = {}, duplicates = [];
      for (const item of lang.value.properties) {
        const key = item.key.name || item.key.value;
        if (Object.hasOwn(values,key)) duplicates.push(key);
        values[key] = item.value.value;
      }
      catalogs[lang.key.name || lang.key.value] = {values,duplicates};
    }
  }});
  const files = [], modules = new Map();
  function walk(dir) { for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const full = path.join(dir,entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'tests') walk(full); }
    else if (/\.(jsx?|tsx?)$/.test(full)) files.push(full);
  }}
  walk(path.join(root,'src'));
  const resolve = (file,name) => {
    if (!name.startsWith('@/') && !name.startsWith('.')) return null;
    const base = name.startsWith('@/') ? path.join(root,'src',name.slice(2)) : path.resolve(path.dirname(file),name);
    return [base,base+'.js',base+'.jsx',base+'.ts',base+'.tsx'].find(x=>fs.existsSync(x)&&fs.statSync(x).isFile()) || null;
  };
  for (const file of files) {
    const item = {file:path.relative(root,file).replaceAll('\\','/'), imports:[], literal_ui:[], locale_calls:[], keys:[], bilingual_branches:0};
    const literal = (value,line,kind) => {
      const text = value.replace(/\s+/g,' ').trim();
      if (/[A-Za-zÀ-ž]/.test(text)) item.literal_ui.push({text,line,kind});
    };
    traverse(parse(file), {
      ImportDeclaration(p) { const target=resolve(file,p.node.source.value); if(target)item.imports.push(target); },
      CallExpression(p) {
        const n=p.node;
        if(n.callee.type==='Import'&&n.arguments[0]?.type==='StringLiteral'){const target=resolve(file,n.arguments[0].value);if(target)item.imports.push(target);}
        if(n.callee.name==='t'&&n.arguments[0]?.type==='StringLiteral')item.keys.push(n.arguments[0].value);
        if(['toLocaleString','toLocaleDateString','toLocaleTimeString'].includes(n.callee.property?.name))item.locale_calls.push({line:n.loc.start.line,locale:n.arguments[0]?.value ?? null});
      },
      JSXText(p) {literal(p.node.value,p.node.loc.start.line,'text')},
      JSXAttribute(p) {if(['placeholder','title','aria-label','alt'].includes(p.node.name.name)&&p.node.value?.type==='StringLiteral')literal(p.node.value.value,p.node.loc.start.line,p.node.name.name)},
      ConditionalExpression(p) { if(p.node.test.type==='BinaryExpression'&&p.node.test.right?.value==='hu')item.bilingual_branches++; },
    });
    modules.set(file,item);
  }
  const app = parse(path.join(root,'src/App.jsx')), components = new Map(), routes=[];
  traverse(app,{
    ImportDeclaration(p) {if(p.node.specifiers[0]?.type==='ImportDefaultSpecifier'){const target=resolve(path.join(root,'src/App.jsx'),p.node.source.value);if(target)components.set(p.node.specifiers[0].local.name,target)}},
    VariableDeclarator(p) {const n=p.node;const arg=n.init?.arguments?.[0]?.body?.arguments?.[0];if(n.init?.callee?.name==='lazy'&&arg?.type==='StringLiteral')components.set(n.id.name,resolve(path.join(root,'src/App.jsx'),arg.value));},
    JSXOpeningElement(p) {
      if(p.node.name.name!=='Route')return;
      const route=p.node.attributes.find(x=>x.name?.name==='path')?.value?.value;
      const component=p.node.attributes.find(x=>x.name?.name==='element')?.value?.expression?.openingElement?.name?.name;
      if(route&&component)routes.push({route,component,file:components.get(component)});
    }
  });
  const reachable = entry => {const seen=new Set();const visit=f=>{if(!f||seen.has(f))return;seen.add(f);for(const next of modules.get(f)?.imports||[])visit(next)};visit(entry);return [...seen].map(x=>modules.get(x)).filter(Boolean);};
  const shared=reachable(path.join(root,'src/components/Layout.jsx'));
  const knownKeys=Object.keys(catalogs.en.values);
  const report={generated_at:new Date().toISOString(),languages:languages.map(lang=>({...lang,catalog_present:Boolean(catalogs[lang.code]),catalog_keys:Object.keys(catalogs[lang.code]?.values||{}).length,missing_keys:knownKeys.filter(k=>!Object.hasOwn(catalogs[lang.code]?.values||{},k)),duplicates:catalogs[lang.code]?.duplicates||[]})),routes:routes.map(({route,component,file})=>{
    const list=[...new Map([...reachable(file),...shared].map(x=>[x.file,x])).values()];
    const keys=[...new Set(list.flatMap(x=>x.keys))];
    return {route,component,files:list.filter(x=>x.literal_ui.length||x.bilingual_branches||x.locale_calls.length).map(({imports,keys,...rest})=>rest),missing_keys_by_language:Object.fromEntries(languages.map(({code})=>[code,keys.filter(k=>!Object.hasOwn(catalogs[code]?.values||{},k))]))};
  }),scope:'Static literal inventory identifies candidates, including product names, units and example commands. It is not a semantic translation proof. User content and data identifiers must not be translated.'};
  return {report,languages,catalogs};
}
module.exports = {inventory};
if (require.main === module) {
  const {report}=inventory();
  const dest=path.resolve(process.argv[2]||'release/localization-source-audit.json');
  fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.writeFileSync(dest,JSON.stringify(report,null,2));
  console.log('Localization inventory:',report.routes.length,'routes,',report.languages.length,'languages,',report.languages.filter(x=>!x.catalog_present).length,'without UI catalogs. Full report:',dest);
}
