'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {inventory} = require('./audit-localization.cjs');
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));

// Operates normal installed controls. CDP values are passed as structured
// arguments, never interpolated into executable JavaScript source.
module.exports = async function auditLanguages(runtime) {
  const {report:source,languages,catalogs}=inventory();
  const report={started_at:new Date().toISOString(),source,checks:[],failures:[],external_provider_acceptance:false,physical_device_acceptance:false};
  let host;
  async function call(fn,...args) {
    if(!host)host=(await runtime.command('Runtime.evaluate',{expression:'globalThis',returnByValue:false})).result.objectId;
    const result=await runtime.command('Runtime.callFunctionOn',{
      objectId:host,functionDeclaration:fn.toString(),arguments:args.map(value=>({value})),awaitPromise:true,returnByValue:true,
    });
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result?.value;
  }
  const navigate=route=>call(function(route){location.hash='#'+route;},route);
  const readScreen=()=>call(function(){
    const visible=el=>Boolean(el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
    const scope=document.querySelector('main')||document.querySelector('#root');
    const nodes=scope?[...scope.querySelectorAll('h1,h2,h3,p,label,button,input,textarea,select,[role="tab"]')].filter(visible):[];
    return {hash:location.hash,lang:localStorage.getItem('app_lang'),document_lang:document.documentElement.lang,dir:document.documentElement.dir,
      text:scope?.innerText?.slice(0,24000)||'',labels:nodes.map(n=>(n.innerText||n.placeholder||n.getAttribute('aria-label')||'').trim()).filter(Boolean)};
  });
  async function openToggle(name){return call(function(name){
    const b=[...document.querySelectorAll('button')].find(b=>b.title===name&&b.getClientRects().length&&getComputedStyle(b).visibility!=='hidden');
    if(b){b.click();return true}return false;
  },name)}
  async function choose(code,current) {
    const currentName=languages.find(x=>x.code===current)?.name;
    const targetName=languages.find(x=>x.code===code).name;
    let opened=await openToggle(currentName);
    if(!opened){
      const more=catalogs[current]?.values.more||catalogs.en.values.more;
      assert.ok(await call(function(more){
        const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===more&&b.getClientRects().length);
        if(b){b.click();return true}return false;
      },more),'LANGUAGE_MENU_NOT_ACCESSIBLE');
      await wait(70);opened=await openToggle(currentName);
    }
    assert.ok(opened,'LANGUAGE_TOGGLE_NOT_AVAILABLE:'+current);
    await wait(60);
    assert.ok(await call(function(currentName,targetName){
      const toggle=[...document.querySelectorAll('button')].find(b=>b.title===currentName&&b.getClientRects().length);
      const b=toggle&&[...toggle.parentElement.querySelectorAll('button')].find(b=>[...b.querySelectorAll('span')].some(s=>s.textContent===targetName));
      if(b){b.click();return true}return false;
    },currentName,targetName),'LANGUAGE_OPTION_NOT_AVAILABLE:'+code);
    for(let i=0;i<40;i++){
      const saved=await call(async function(){return {local:localStorage.getItem('app_lang'),native:(await window.jarvisDesktop.getSettings()).language}});
      if(saved.local===code&&saved.native===code)return;
      await wait(50);
    }
    throw new Error('LANGUAGE_NOT_PERSISTED:'+code);
  }
  await runtime.command('Runtime.enable');
  await runtime.command('Emulation.setDeviceMetricsOverride',{width:430,height:900,deviceScaleFactor:1,mobile:false});
  let current=await call(function(){return localStorage.getItem('app_lang')||'hu'});
  const routes=source.routes.map(x=>x.route==='*'?'/audit-missing-page':x.route);
  for(const route of routes){
    await navigate(route);await wait(500);
    await call(function(){
      const b=[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&/^(Kihagyás|Skip|Überspringen|Passer|Saltar)$/.test(b.textContent.trim()));b?.click();
    });
    const routeCheck={route,screens:[],language_switches:[],errors:[]};
    for(const {code} of languages){
      try {
        if(route==='/audit-missing-page'){
          await navigate('/chat');await wait(240);await choose(code,current);current=code;
          await navigate(route);await wait(240);
        }else {await choose(code,current);current=code;await wait(30)}
        const screen=await readScreen();
        assert.equal(screen.lang,code,'VISIBLE_LANGUAGE_STATE');
        assert.ok(screen.text.trim().length>0,'EMPTY_RENDERED_SCREEN');
        assert.ok(!/^Valami hiba történt\s*Kérlek próbáld meg újra\./.test(screen.text.trim()),'REACT_ERROR_BOUNDARY');
        routeCheck.screens.push({code,...screen});routeCheck.language_switches.push(code);
      }catch(error){routeCheck.errors.push({code,error:String(error.stack||error)});report.failures.push({route,code,error:String(error.message||error)});}
    }
    report.checks.push(routeCheck);
    console.log('Language UI audit:',route,routeCheck.language_switches.length+'/'+languages.length,'switches;',routeCheck.errors.length,'runtime failures');
    fs.mkdirSync('release',{recursive:true});fs.writeFileSync('release/windows-language-audit.json',JSON.stringify(report,null,2));
  }
  await navigate('/chat');await wait(300);await choose('en',current);current='en';
  await runtime.command('Page.reload');host=null;await wait(1300);
  const reloaded=await call(function(){return {local:localStorage.getItem('app_lang'),root:document.querySelector('#root')?.innerText}});
  assert.equal(reloaded.local,'en','RELOAD_LANGUAGE_LOST');assert.ok(reloaded.root?.includes('Home'),'RELOAD_INTERFACE_LANGUAGE_LOST');
  await choose('hu',current);
  await runtime.command('Emulation.clearDeviceMetricsOverride');
  report.language_state_success=report.failures.length===0;
  report.catalog_complete=source.languages.every(x=>x.catalog_present&&x.missing_keys.length===0);
  report.interface_complete=false; // semantic translation and live output review are separate
  report.finished_at=new Date().toISOString();
  fs.writeFileSync('release/windows-language-audit.json',JSON.stringify(report,null,2));
  return report;
};
