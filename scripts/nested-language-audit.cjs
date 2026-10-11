'use strict';
const assert = require('node:assert/strict');

// Passive view changes only. Never submits a form, initiates an AI request,
// sends mail, dials a phone, repairs the system or controls physical devices.
module.exports = async function auditNestedViews(ui) {
  const cases=[];
  const tab=(route,name,attribute,values,prefix=[])=>{
    for(const value of values)cases.push({route,name:name+':'+value,steps:[...prefix,`[${attribute}="${value}"]`],selected:`[${attribute}="${value}"]`});
  };
  const form=(route,name,prefix=[],view=name)=>cases.push({route,name:'form:'+name,steps:[...prefix,`[data-audit-open="${name}"]`],view:`[data-audit-view="${view}"]`,close:`[data-audit-close="${view}"]`});
  tab('/tools/finance','finance','data-finance-tab',['attekintes','tetelek']);
  form('/tools/finance','finance-entry');
  form('/tools/invoices','invoice');
  tab('/retail','retail','data-retail-tab',['inventory','stocktake','restock','sales','insights']);
  form('/retail','product');form('/retail','sale');
  tab('/holding','holding','data-holding-tab',['businesses','optimizer']);
  form('/holding','business');
  const business='[data-business-name="Acceptance shop"]';
  tab('/holding','business','data-business-tab',['Áttekintés','Projektek','HR','Ügyfelek','Számlák'],[business]);
  for(const [name,tabName] of [['project','Projektek'],['employee','HR'],['client','Ügyfelek']])form('/holding',name,[business,`[data-business-tab="${tabName}"]`],'business-form');
  form('/contacts','contact');form('/contacts','phone-options');
  form('/smarthome','device');form('/routines','routine');form('/obd2','vehicle');
  for(const panel of ['layers','ai','projects','filters','style'])cases.push({route:'/tools/image-editor',name:'editor:'+panel,steps:[`[data-editor-panel="${panel}"]`],view:'[role="dialog"]',escape:true});
  const report={languages:['hu','en','de','fr','es'],cases:cases.map(({route,name})=>({route,name})),checks:[],failures:[],scope:'Read-only nested views, all five available UI catalogs. Dynamic answers and physical devices require separate live acceptance.'};
  for(const code of report.languages){
    await ui.navigate('/chat');await ui.wait(350);await ui.dismissTutorial();await ui.choose(code);await ui.closeMore();
    for(const item of cases){
      try {
        // Unmount prior forms/details through normal navigation so each case
        // starts with its route's default state and isolated fixture data.
        await ui.navigate('/chat');await ui.wait(180);
        await ui.navigate(item.route);await ui.wait(430);await ui.dismissTutorial();
        for(const selector of item.steps){
          let found=false;
          for(let i=0;i<30&&!found;i++){
            found=await ui.click('selector',selector);
            if(!found)await ui.wait(60);
          }
          assert.ok(found,'NESTED_CONTROL_NOT_FOUND:'+selector);await ui.wait(280);
        }
        if(item.view)assert.ok(await ui.call(function(selector){const e=document.querySelector(selector);return Boolean(e?.getClientRects().length)},item.view),'NESTED_VIEW_NOT_OPEN');
        if(item.selected)assert.equal(await ui.call(function(selector){return document.querySelector(selector)?.getAttribute('aria-pressed')},item.selected),'true','TAB_NOT_SELECTED');
        const screen=await ui.readScreen();
        assert.equal(screen.lang,code,'NESTED_LANGUAGE_LOST');assert.equal(screen.document_lang,code,'NESTED_DOCUMENT_LANGUAGE');
        assert.ok(screen.text.trim().length>0,'NESTED_EMPTY_SCREEN');
        report.checks.push({route:item.route,name:item.name,code,...screen});
        if(item.close)assert.ok(await ui.click('selector',item.close),'FORM_CLOSE_NOT_AVAILABLE');
        if(item.escape)await ui.escape();
        if(item.view){
          let open=true;
          for(let i=0;i<40&&open;i++){
            await ui.wait(50);
            open=await ui.call(function(selector){const e=document.querySelector(selector);return Boolean(e?.getClientRects().length)},item.view);
          }
          assert.equal(open,false,'NESTED_VIEW_DID_NOT_CLOSE');
        }
      }catch(error){report.failures.push({route:item.route,name:item.name,code,error:String(error.message||error)})}
    }
    console.log('Nested language audit:',code,report.checks.filter(x=>x.code===code).length+'/'+cases.length,'views;',report.failures.filter(x=>x.code===code).length,'failures');
  }
  return report;
};
