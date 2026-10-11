import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createLanguagePreferences, languageDirection, localeForLanguage } from '../lib/languagePreferences.js';
import { validateFuelLog } from '../lib/fuelLogValidation.js';
import { readTutorialHistory, completeTutorial } from '../lib/tutorialPreferences.js';
import { moduleHarness } from './helpers/runtime-module.js';

const require = createRequire(import.meta.url);
const inventory = require('../../scripts/audit-localization.cjs').inventory;
const { languages } = inventory();
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no)=>{resolve=yes;reject=no}); return {promise,resolve,reject}; };
const memoryStorage = value => ({ value, getItem(){return this.value}, setItem(_key,value){this.value=value} });

test('all 42 language choices persist and restore with their correct locale and direction', async () => {
  for (const language of languages) {
    const storage=memoryStorage(null);let native;
    const p=createLanguagePreferences({languages,storage,bridge:{getSettings:async()=>({language:native}),saveSettings:async patch=>{native=patch.language}}});
    assert.equal((await p.select(language.code)).success,true);
    assert.equal(storage.value,language.code);assert.equal(native,language.code);
    assert.equal(createLanguagePreferences({languages,storage}).current,language.code);
    const restored=createLanguagePreferences({languages,storage:memoryStorage(null),bridge:{getSettings:async()=>({language:native})}});
    assert.equal(await restored.hydrate(),language.code);
    assert.equal(localeForLanguage(language.code,languages),language.speechCode);
    assert.doesNotThrow(()=>new Intl.DateTimeFormat(localeForLanguage(language.code,languages)).format(new Date('2026-10-09T12:00:00Z')));
    assert.equal(languageDirection(language.code),['ar','he','fa'].includes(language.code)?'rtl':'ltr');
  }
});

test('invalid stale storage does not block valid native language hydration', async () => {
  const storage=memoryStorage('not-a-language');let displayed;
  const p=createLanguagePreferences({languages,storage,bridge:{getSettings:async()=>({language:'de'})},onChange:code=>{displayed=code}});
  assert.equal(p.current,'hu');assert.equal(await p.hydrate(),'de');assert.equal(storage.value,'de');assert.equal(displayed,'de');
});

test('a delayed startup read cannot overwrite a newer user selection', async () => {
  const read=deferred(),storage=memoryStorage(null);const p=createLanguagePreferences({languages,storage,bridge:{getSettings:()=>read.promise,saveSettings:async()=>{}}});
  const hydrated=p.hydrate();await p.select('fr');read.resolve({language:'hu'});await hydrated;
  assert.equal(p.current,'fr');assert.equal(storage.value,'fr');
});

test('rapid selections are committed in order even when the first write is slow', async () => {
  const first=deferred(),calls=[],statuses=[];
  const p=createLanguagePreferences({languages,storage:memoryStorage(null),bridge:{saveSettings:async ({language})=>{calls.push(language);if(calls.length===1)await first.promise}},onStatus:s=>statuses.push(s)});
  const a=p.select('en'),b=p.select('de'),c=p.select('fr');await Promise.resolve();
  assert.deepEqual(calls,['en']);assert.equal(p.current,'fr');first.resolve();await Promise.all([a,b,c]);
  assert.deepEqual(calls,['en','de','fr']);assert.deepEqual(statuses.at(-1),{pending:false,error:false});
});

test('a failed native write is reported and does not poison the next selection', async () => {
  let failed=true;const statuses=[];
  const p=createLanguagePreferences({languages,storage:memoryStorage(null),bridge:{saveSettings:async()=>{if(failed)throw new Error('DISK_FULL')}},onStatus:s=>statuses.push(s)});
  assert.equal((await p.select('en')).success,false);assert.equal(statuses.at(-1).error,true);
  failed=false;assert.equal((await p.select('de')).success,true);assert.equal(statuses.at(-1).error,false);
});

test('blocked renderer storage can still use and persist the native preference', async () => {
  const storage={getItem(){throw new Error('BLOCKED')},setItem(){throw new Error('BLOCKED')}};
  let native;
  const p=createLanguagePreferences({languages,storage,bridge:{getSettings:async()=>({language:'es'}),saveSettings:async({language})=>{native=language}}});
  assert.equal(await p.hydrate(),'es');assert.equal((await p.select('de')).success,true);assert.equal(native,'de');
});

test('invalid language input cannot touch UI state, local storage or native settings', async () => {
  const storage=memoryStorage('en');let writes=0;const p=createLanguagePreferences({languages,storage,bridge:{saveSettings:async()=>{writes++}}});
  for (const code of [null,undefined,'','zz','../../','__proto__',{},42,'en-GB'])assert.equal((await p.select(code)).success,false);
  assert.equal(p.current,'en');assert.equal(storage.value,'en');assert.equal(writes,0);
});

function languageEngine(invoke=async()=>({language:'en'})) {
  return moduleHarness({stubs:{'@/lib/llmGateway':{invokeWithRetry:invoke},'@/lib/i18n':{SUPPORTED_LANGUAGES:languages}}}).load('src/lib/languageEngine.js');
}

test('language detection counts all words and does not bias ties towards Hungarian', () => {
  const engine=languageEngine();
  assert.equal(engine.detectLanguageHeuristic('This is the report and where is the invoice?'),'en');
  assert.equal(engine.detectLanguageHeuristic('Én még nem tudom, hogy miért vagy itt'),'hu');
  assert.equal(engine.detectLanguageHeuristic('Ich bin hier und wir haben das nicht gesehen'),'de');
  assert.equal(engine.detectLanguageHeuristic('Je suis avec vous dans une voiture'),'fr');
  assert.equal(engine.detectLanguageHeuristic('Yo estoy con los clientes para hacer una factura'),'es');
  assert.equal(engine.detectLanguageHeuristic('is'),null);assert.equal(engine.detectLanguageHeuristic(null),null);
});

test('language detection rejects invalid provider codes and keeps the selected fallback when offline', async () => {
  const invalid=languageEngine(async()=>({language:'zz'}));await assert.rejects(invalid.detectLanguageLLM('ciao'),/UNSUPPORTED_DETECTED_LANGUAGE/);
  assert.equal(await invalid.detectLanguage('ciao','it'),'it');
  const offline=languageEngine(async()=>{throw new Error('PROVIDER_OFFLINE')});assert.equal(await offline.detectLanguage('你好，朋友','zh'),'zh');
});

test('provider detection requests valid JSON and instructions name all supported languages', async () => {
  let request;
  const engine=languageEngine(async r=>{request=r;return {language:'it'}});
  assert.equal(await engine.detectLanguageLLM('ciao "x"'),'it');
  assert.deepEqual([...request.response_json_schema.required],['language']);
  assert.equal(request.response_json_schema.properties.language.enum.length,42);
  for (const l of languages)assert.ok(engine.getLanguageInstruction(l.code).includes('Always respond in '+l.name));
});

const validFuel={date:'2026-10-09',liters:'25.5',total_cost:'40.25',distance_km:'300',odometer:''};
test('fuel validation preserves units and rejects corrupt dates and nonfinite amounts', () => {
  assert.deepEqual(validateFuelLog(validFuel),{...validFuel,liters:25.5,total_cost:40.25,distance_km:300,odometer:undefined});
  for (const [key,values] of Object.entries({date:['2026-02-30','2026-13-01','bad',''],liters:['',0,-1,Infinity,NaN,[],[25],true,{}],total_cost:['',-1,Infinity,NaN],distance_km:['',0,-1,Infinity,NaN],odometer:[-1,Infinity,NaN]}))for (const value of values)assert.throws(()=>validateFuelLog({...validFuel,[key]:value}),/INVALID_FUEL_/);
  for (const form of [null,undefined,[]])assert.throws(()=>validateFuelLog(form),/INVALID_FUEL_FORM/);
});

test('corrupt tutorial preferences cannot crash a page and existing valid entries are preserved', () => {
  for (const value of ['broken','null','[]','42','"text"'])assert.deepEqual(readTutorialHistory(memoryStorage(value)),{});
  const storage=memoryStorage('{"already-seen":true,"not-seen":false}');
  assert.equal(completeTutorial(storage,'new-tutorial'),true);
  assert.deepEqual(JSON.parse(storage.value),{'already-seen':true,'new-tutorial':true});
  assert.equal(completeTutorial(storage,'__proto__'),true);
  assert.equal(Object.hasOwn(readTutorialHistory(storage),'__proto__'),true);
  assert.equal({}.polluted,undefined);
});

test('a tutorial can be dismissed even if optional preference storage is unavailable', () => {
  const storage={getItem(){throw new Error('BLOCKED')},setItem(){throw new Error('DISK_FULL')}};
  assert.deepEqual(readTutorialHistory(storage),{});assert.equal(completeTutorial(storage,'intro'),false);
  const states=[],effects=[];let index=0;
  const hooks={useState(initial){const i=index++;if(!(i in states))states[i]=initial;return [states[i],value=>states[i]=value]},useEffect(fn){effects.push(fn)}};
  let completed=0;
  const Component=moduleHarness({stubs:{react:hooks,'lucide-react':{ChevronRight:()=>null,ChevronLeft:()=>null,X:()=>null,Check:()=>null},'framer-motion':{motion:{div:'div'},AnimatePresence:'section'},'@/lib/i18n':{useLang:()=>({t:k=>k})}},globals:{window:{get localStorage(){throw new Error('BLOCKED')}}}}).load('src/components/tutorial/TutorialOverlay.jsx').default;
  const render=()=>{index=0;return Component({tutorialId:'intro',steps:[{title:'Help',description:'Read me'}],onComplete:()=>{completed++}})};
  render();effects[0]();assert.equal(states[1],true);
  const visit=node=>{
    if(!node||typeof node!=='object')return null;
    if(node.props&&Object.hasOwn(node.props,'data-tutorial-dismiss'))return node;
    for (const child of [node.props?.children].flat(Infinity)){const found=visit(child);if(found)return found;}
    return null;
  };
  const button=visit(render());assert.ok(button);button.props.onClick();assert.equal(states[1],false);assert.equal(completed,1);
});

function fuelForm(onSubmit) {
  const states=[],refs=[];let stateIndex=0,refIndex=0;
  const hooks={useState(initial){const i=stateIndex++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value}]},useRef(initial){const i=refIndex++;return refs[i]||(refs[i]={current:initial})}};
  const Component=moduleHarness({stubs:{react:hooks,'lucide-react':{Plus:()=>null},'@/lib/i18n':{useLang:()=>({t:key=>key})}},fallback:name=>require(name)}).load('src/components/fuel/FuelLogForm.jsx').default;
  const render=()=>{stateIndex=0;refIndex=0;return Component({vehicles:[],saving:false,onSubmit})};
  render();states[1]={...states[1],...validFuel};return {render,states};
}

test('a failed fuel save retains entered values and exposes an actionable error', async () => {
  const form=fuelForm(async()=>{throw new Error('DISK_FULL')});
  await form.render().props.onSubmit({preventDefault(){}});
  assert.equal(form.states[1].liters,'25.5');assert.equal(form.states[1].total_cost,'40.25');assert.equal(form.states[0],'fuel_save_error');
});

test('fuel form prevents concurrent duplicate submits and clears only after confirmed success', async () => {
  const saved=deferred();let calls=0;const form=fuelForm(async()=>{calls++;await saved.promise});const submit=form.render().props.onSubmit;
  const first=submit({preventDefault(){}});await submit({preventDefault(){}});
  assert.equal(calls,1);assert.equal(form.states[1].liters,'25.5');saved.resolve();await first;assert.equal(form.states[1].liters,'');assert.equal(form.states[0],'');
});

test('changing language reformats existing OBD chart history without changing stored readings', () => {
  const timestamp='2026-10-09T13:07:05Z';
  const find=(node,predicate)=>{
    if(!node||typeof node!=='object')return null;
    if(predicate(node))return node;
    for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}
    return null;
  };
  for(const file of ['src/components/obd2/OBD2DataReader.jsx','src/components/obd2/OBD2Dashboard.jsx']){
    let index=0,locale='hu-HU';const states=[];
    const hooks={useState(initial){const i=index++;if(!(i in states))states[i]=initial;return [states[i],value=>states[i]=value]},useEffect(){}};
    const stubs={react:hooks,'@/lib/i18n':{useLang:()=>({locale})},'framer-motion':{motion:{div:'div'},AnimatePresence:'section'},
      '@/components/obd2/OBD2VisualDataPanel':'visual-data','./OBD2WidgetDashboard':'widgets','@/lib/obd2ErrorHandler':{},
      'lucide-react':Object.fromEntries(['Loader2','Gauge','Thermometer','AlertCircle','Wind','AlertTriangle','Trash2','Settings'].map(name=>[name,name])),
      recharts:Object.fromEntries(['LineChart','Line','XAxis','YAxis','CartesianGrid','Tooltip','ResponsiveContainer','ComposedChart','Bar'].map(name=>[name,name]))};
    const Component=moduleHarness({stubs,fallback:name=>require(name)}).load(file).default;
    const render=()=>{index=0;return Component({manager:null,obd2Manager:null,isConnected:true})};
    render();states[1]=[{timestamp,rpm:1500,temperature:85,maf:4,speed:25}];
    const getEntry=tree=>{const n=find(tree,n=>n.type==='visual-data'||n.type==='LineChart');assert.ok(n);return (n.props.history||n.props.data)[0]};
    const before=getEntry(render());locale='ar-SA';const after=getEntry(render());
    assert.notEqual(before.time,after.time);assert.equal(after.rpm,1500);assert.equal(after.timestamp,timestamp);assert.equal(states[1][0].time,undefined);
  }
});
