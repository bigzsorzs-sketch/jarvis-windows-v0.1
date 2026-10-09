'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {inventory} = require('./audit-localization.cjs');
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));

// Operates the installed application's normal controls. No React internals,
// replacement preload, provider key or physical-device command is used.
module.exports = async function auditLanguages(runtime) {
  const {report:source,languages,catalogs}=inventory();
  const report={started_at:new Date().toISOString(),source,checks:[],failures:[],external_provider_acceptance:false,physical_device_acceptance:false};
  const visible=`el => Boolean(el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')`;
  const readScreen=()=>runtime.evaluate(`(() => {
    const visible=${visible}; const main=document.querySelector('main');
    const scope=main || document.querySelector('#root');
    const nodes=scope?[...scope.querySelectorAll('h1,h2,h3,p,label,button,input,textarea,select,[role="tab"]')].filter(visible):[];
    return {hash:location.hash,lang:localStorage.getItem('app_lang'),document_lang:document.documentElement.lang,dir:document.documentElement.dir,
      text:scope?.innerText?.slice(0,24000)||'',labels:nodes.map(n=>(n.innerText||n.placeholder||n.getAttribute('aria-label')||'').trim()).filter(Boolean)};
  })()`);
  async function choose(code,current) {
    const currentName=languages.find(x=>x.code===current)?.name;
    const targetName=languages.find(x=>x.code===code).name;
    let opened=await runtime.evaluate(`(() => {const visible=${visible};const b=[...document.querySelectorAll('button')].find(b=>b.title===${JSON.stringify(currentName)}&&visible(b));if(b){b.click();return true}return false})()`);
    if(!opened){
      const more=catalogs[current]?.values.more||catalogs.en.values.more;
      assert.ok(await runtime.evaluate(`(() => {const visible=${visible};const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(more)}&&visible(b));if(b){b.click();return true}return false})()`),'LANGUAGE_MENU_NOT_ACCESSIBLE');
      await wait(70);
      opened=await runtime.evaluate(`(() => {const visible=${visible};const b=[...document.querySelectorAll('button')].find(b=>b.title===${JSON.stringify(currentName)}&&visible(b));if(b){b.click();return true}return false})()`);
    }
    assert.ok(opened,'LANGUAGE_TOGGLE_NOT_AVAILABLE:'+current);
    await wait(60);
    assert.ok(await runtime.evaluate(`(() => {const visible=${visible};const toggle=[...document.querySelectorAll('button')].find(b=>b.title===${JSON.stringify(currentName)}&&visible(b));const b=toggle&&[...toggle.parentElement.querySelectorAll('button')].find(b=>[...b.querySelectorAll('span')].some(s=>s.textContent===${JSON.stringify(targetName)}));if(b){b.click();return true}return false})()`),'LANGUAGE_OPTION_NOT_AVAILABLE:'+code);
    for(let i=0;i<40;i++){
      const saved=await runtime.evaluate(`(async () => ({local:localStorage.getItem('app_lang'),native:(await window.jarvisDesktop.getSettings()).language}))()`);
      if(saved.local===code&&saved.native===code)return;
      await wait(50);
    }
    throw new Error('LANGUAGE_NOT_PERSISTED:'+code);
  }
  await runtime.command('Runtime.enable');
  await runtime.command('Emulation.setDeviceMetricsOverride',{width:430,height:900,deviceScaleFactor:1,mobile:false});
  let current=await runtime.evaluate(`localStorage.getItem('app_lang') || 'hu'`);
  const routes=source.routes.map(x=>x.route==='*'?'/audit-missing-page':x.route);
  for(const route of routes){
    await runtime.evaluate(`location.hash=${JSON.stringify('#'+route)}`);
    await wait(500);
    // Disable only educational overlays through their normal dismiss controls.
    // These are independently audited below; they must not cover page actions.
    await runtime.evaluate(`(() => {const visible=${visible};const b=[...document.querySelectorAll('button')].find(b=>visible(b)&&/^(Kihagyás|Skip|Überspringen|Passer|Saltar)$/.test(b.textContent.trim()));b?.click()})()`);
    const routeCheck={route,screens:[],language_switches:[],errors:[]};
    for(const {code} of languages){
      try {
        // A wildcard page has no Layout or language menu. Exercise it using a
        // previously selected language, without pretending it has a picker.
        if(route==='/audit-missing-page'){
          await runtime.evaluate(`location.hash='#/chat'`); await wait(240);
          await choose(code,current);current=code;
          await runtime.evaluate(`location.hash='#/audit-missing-page'`);await wait(240);
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
    // Preserve progress so an interrupted runner never looks like a pass.
    fs.mkdirSync('release',{recursive:true});fs.writeFileSync('release/windows-language-audit.json',JSON.stringify(report,null,2));
  }
  await runtime.evaluate(`location.hash='#/chat'`);await wait(300);
  await choose('en',current);current='en';
  await runtime.command('Page.reload');await wait(1300);
  const reloaded=await runtime.evaluate(`({local:localStorage.getItem('app_lang'),root:document.querySelector('#root')?.innerText})`);
  assert.equal(reloaded.local,'en','RELOAD_LANGUAGE_LOST');assert.ok(reloaded.root?.includes('Home'),'RELOAD_INTERFACE_LANGUAGE_LOST');
  await choose('hu',current);
  await runtime.command('Emulation.clearDeviceMetricsOverride');
  report.language_state_success=report.failures.length===0;
  report.catalog_complete=source.languages.every(x=>x.catalog_present&&x.missing_keys.length===0);
  report.interface_complete=false; // literal/semantic and live output review remains required
  report.finished_at=new Date().toISOString();
  fs.writeFileSync('release/windows-language-audit.json',JSON.stringify(report,null,2));
  return report;
};
