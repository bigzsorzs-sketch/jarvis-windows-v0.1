import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const repair=require('../../electron/developer-repair.cjs');

function workspace(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-link-audit-'));
  const external=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-external-source-'));
  t.after(()=>{
    fs.rmSync(root,{recursive:true,force:true});
    fs.rmSync(external,{recursive:true,force:true});
  });
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'jarvis-desktop',version:'test'}));
  fs.mkdirSync(path.join(root,'src','pages'),{recursive:true});
  return {root,external};
}

test('source walker explicitly skips symbolic links before reading content',()=>{
  const source=fs.readFileSync('electron/developer-repair.cjs','utf8');
  assert.match(source,/if \(entry\.isSymbolicLink\(\)\) continue/);
  assert.match(source,/function assertNotSymlink\(target\)/);
  assert.equal((source.match(/assertNotSymlink\(target\);/g)||[]).length,2);
});

test('external symlink contents never appear in Self-Repair diagnostic context',t=>{
  const {root,external}=workspace(t);
  const externalFile=path.join(external,'sensitive.js');
  const marker='PRIVATE_EXTERNAL_SOURCE_SENTINEL_852903';
  fs.writeFileSync(externalFile,marker);
  const link=path.join(root,'src','pages','linked.js');
  try {fs.symlinkSync(externalFile,link,'file');}
  catch (error) {
    if (['EPERM','EACCES','ENOTSUP'].includes(error?.code)) {t.skip('OS does not permit test symlinks');return;}
    throw error;
  }
  const inspected=repair.inspectWorkspace(root);
  assert.equal(inspected.files.some(file=>file.path==='src/pages/linked.js'),false);
  const diagnostics=repair.buildDiagnosticContext(root,'linked sensitive source',{
    maxFiles:10,maxChars:30000
  });
  assert.equal(JSON.stringify(diagnostics).includes(marker),false);
});

test('AI-approved direct patch cannot write through a linked external file',t=>{
  const {root,external}=workspace(t);
  const externalFile=path.join(external,'private.js');
  fs.writeFileSync(externalFile,'export const secret="external";');
  const link=path.join(root,'src','pages','linked.js');
  try {fs.symlinkSync(externalFile,link,'file');}
  catch (error) {
    if (['EPERM','EACCES','ENOTSUP'].includes(error?.code)) {t.skip('OS does not permit test symlinks');return;}
    throw error;
  }
  assert.throws(()=>repair.validateOwnerPlan(root,{
    goal:'edit linked file',risk:'low',patches:[{
      file:'src/pages/linked.js',content:'export default "changed";'
    }]
  }),/DEV_REPAIR_SYMLINK_ESCAPE/);
  assert.equal(fs.readFileSync(externalFile,'utf8'),'export const secret="external";');
});

test('ordinary in-workspace file patch remains permitted',t=>{
  const {root}=workspace(t);
  fs.writeFileSync(path.join(root,'src','pages','safe.js'),'export const answer=1;');
  const plan=repair.validateOwnerPlan(root,{
    goal:'change safe file',risk:'low',patches:[{
      file:'src/pages/safe.js',replacements:[{search:'answer=1',replace:'answer=2'}]
    }]
  });
  assert.match(plan.hash,/^[a-f0-9]{64}$/);
});
