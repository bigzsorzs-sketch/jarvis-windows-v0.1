import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function actualHistoryNormalization() {
  const source=fs.readFileSync('src/lib/conversationHistory.js','utf8');
  const start=source.indexOf('function normalizeMessages(');
  const end=source.indexOf('export function conversationTitle(',start);
  assert.ok(start>=0&&end>start);
  return vm.runInNewContext(source.slice(start,end)+'; normalizeMessages',{Date,Number,String,Array,Math});
}

const normalize=actualHistoryNormalization();

test('normal chat history retains attachment identity without duplicating Base64 file data',()=>{
  const rawUrl='data:application/octet-stream;base64,'+'A'.repeat(3*1024*1024);
  const messages=[{role:'user',content:'Check this file',attachedFiles:[
    {url:rawUrl,name:'source.zip',kind:'archive',size:2250000,type:'application/zip'},
    {url:'data:image/png;base64,aGVsbG8=',name:'photo.png',kind:'image',size:5,type:'image/png'}
  ]}];
  const records=normalize(messages);
  assert.equal(records.length,1);
  assert.equal(records[0].attachedFiles.length,2);
  assert.equal(records[0].attachedFiles[0].name,'source.zip');
  assert.equal(records[0].attachedFiles[0].kind,'archive');
  assert.equal(records[0].attachedFiles[0].size,2250000);
  assert.equal(records[0].attachedFiles[0].metadataOnly,true);
  assert.equal(records[0].attachedFiles[0].url,undefined);
  assert.equal(records[0].attachedFiles[1].name,'photo.png');
  assert.ok(JSON.stringify(records).length<1024,'stored history must not copy megabytes of Base64');
});

test('normalization caps attachment metadata and never saves attacker supplied URLs',()=>{
  const files=Array.from({length:25},(_,i)=>({name:'file-'+i,kind:'document',url:'https://untrusted.example/file-'+i}));
  const [normalized]=normalize([{role:'user',content:'Files',attachedFiles:files}]);
  assert.equal(normalized.attachedFiles.length,20);
  assert.equal(normalized.attachedFiles.every(file=>!Object.hasOwn(file,'url')),true);
  assert.equal(normalized.attachedFiles[0].name,'file-0');
  assert.equal(normalized.attachedFiles.at(-1).name,'file-19');
});

test('chat history UI labels unavailable attachments rather than rendering broken media',()=>{
  const view=fs.readFileSync('src/components/chat/ChatMessageBubble.jsx','utf8');
  assert.match(view,/!f\?\.url \|\| f\.metadataOnly/);
  assert.match(view,/a fájl tartalma nem része a mentett előzményeknek/);
  const condition=view.indexOf('if (!f?.url || f.metadataOnly)');
  const media=view.indexOf("if (f.kind === 'image')",condition);
  assert.ok(media>condition,'metadata-only fallback must precede media renderers');
});
