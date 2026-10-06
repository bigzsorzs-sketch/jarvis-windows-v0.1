import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const repair = require('../../electron/developer-repair.cjs');
const read = (file) => fs.readFileSync(file, 'utf8');

function makeWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-v0312-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name:'jarvis-desktop', version:'0.3.17' }));
  fs.mkdirSync(path.join(root, 'src', 'pages'), { recursive:true });
  return root;
}

test('Self-Repair replacement matching accepts Windows CRLF source with LF model search text', () => {
  const root = makeWorkspace();
  try {
    const file = path.join(root, 'src', 'pages', 'EditablePage.jsx');
    fs.writeFileSync(file, 'alpha\r\nbeta\r\ngamma\r\n', 'utf8');
    const plan = repair.validateOwnerPlan(root, {goal:'CRLF repair',risk:'low',patches:[{file:'src/pages/EditablePage.jsx',replacements:[{search:'alpha\nbeta\ngamma',replace:'alpha\nbeta-fixed\ngamma',all:false}]}]});
    repair.applyOwner(root, plan);
    const updated = fs.readFileSync(file, 'utf8');
    assert.equal(updated.includes('beta-fixed'), true);
    assert.equal(updated.includes('\r\n'), true);
  } finally { fs.rmSync(root, { recursive:true, force:true }); }
});

test('Self-Repair rejects stale search text before an owner-approved write', () => {
  const root = makeWorkspace();
  try {
    fs.writeFileSync(path.join(root, 'src', 'pages', 'EditablePage.jsx'), 'export default function SystemCenter(){}\n');
    assert.throws(() => repair.validateOwnerPlan(root, {patches:[{file:'src/pages/EditablePage.jsx',replacements:[{ search:'stale block from previous version', replace:'x' }]}]}), /DEV_REPAIR_SEARCH_NOT_FOUND:src\/pages\/EditablePage\.jsx/);
  } finally { fs.rmSync(root, { recursive:true, force:true }); }
});

test('Home reference layout keeps bright energy lines behind the orb', () => {
  const stage = read('src/components/command-center/JarvisVoiceStage.jsx');
  const css = read('src/styles/command-center.css');
  assert.equal(stage.includes('className="jarvis-orb-scene"'), true);
  assert.equal(css.includes('v0.3.12 — reference fidelity'), true);
  assert.equal(css.includes('.jarvis-orb-scene .jarvis-energy-field'), true);
  assert.equal(css.includes('place-items:center'), true);
  assert.equal(css.includes('stroke:#64d9ff'), true);
});

test('Home voice wave uses a centered reference-style pulse instead of full-width saw teeth', () => {
  const stage = read('src/components/command-center/JarvisVoiceStage.jsx');
  assert.equal(stage.includes('0,26 235,26 270,25'), true);
  assert.equal(stage.includes('545,26 760,26'), true);
  assert.equal(stage.includes('322,5 332,47'), false);
});

test('release version is synchronized', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const versionSource = read('src/lib/appVersion.js');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(versionSource.includes(`APP_VERSION = '${pkg.version}'`), true);
});
