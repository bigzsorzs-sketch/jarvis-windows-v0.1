'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const repair = require('../../electron/developer-repair.cjs');

function workspace() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-repair-src-'));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'jarvis-desktop'}));
  fs.mkdirSync(path.join(root,'src'),{recursive:true});
  fs.writeFileSync(path.join(root,'src','sample.js'),'module.exports = 1;\n');
  return root;
}

test('repair patch is isolated in sandbox until promotion', () => {
  const root=workspace();
  const sandboxes=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-repair-box-'));
  const plan=repair.validatePlan(root,{goal:'test',risk:'low',patches:[{file:'src/sample.js',content:'module.exports = 2;\n'}]});
  const box=repair.createSandbox(root,plan,sandboxes);
  assert.equal(fs.readFileSync(path.join(root,'src','sample.js'),'utf8'),'module.exports = 1;\n');
  assert.equal(fs.readFileSync(path.join(box,'src','sample.js'),'utf8'),'module.exports = 2;\n');
  const meta=JSON.parse(fs.readFileSync(path.join(box,'.jarvis-sandbox.json'),'utf8'));
  assert.equal(meta.hash,plan.hash);
  repair.destroySandbox(box,sandboxes);
  assert.equal(fs.existsSync(box),false);
  fs.rmSync(root,{recursive:true,force:true});
  fs.rmSync(sandboxes,{recursive:true,force:true});
});

test('protected core files remain blocked from self-repair plans', () => {
  const root=workspace();
  assert.throws(() => repair.validatePlan(root,{patches:[{file:'electron/main.cjs',content:'x'}]}),/DEV_REPAIR_PROTECTED_PATH/);
  fs.rmSync(root,{recursive:true,force:true});
});
