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
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name:'jarvis-desktop', version:'0.3.12' }));
  fs.mkdirSync(path.join(root, 'src', 'pages'), { recursive:true });
  return root;
}

test('Self-Repair replacement matching accepts Windows CRLF source with LF model search text', () => {
  const root = makeWorkspace();
  try {
    const file = path.join(root, 'src', 'pages', 'SystemCenter.jsx');
    fs.writeFileSync(file, 'alpha\r\nbeta\r\ngamma\r\n', 'utf8');

    const plan = repair.validatePlan(root, {
      goal:'CRLF repair',
      risk:'low',
      patches:[{
        file:'src/pages/SystemCenter.jsx',
        replacements:[{
          search:'alpha\nbeta\ngamma',
          replace:'alpha\nbeta-fixed\ngamma',
          all:false
        }]
      }]
    });

    repair.apply(root, plan);
    const updated = fs.readFileSync(file, 'utf8');
    assert.equal(updated.includes('beta-fixed'), true);
    assert.equal(updated.includes('\r\n'), true);
  } finally {
    fs.rmSync(root, { recursive:true, force:true });
  }
});

test('Self-Repair rejects missing search text during plan validation instead of crashing in sandbox', () => {
  const root = makeWorkspace();
  try {
    fs.writeFileSync(path.join(root, 'src', 'pages', 'SystemCenter.jsx'), 'export default function SystemCenter(){}\n');
    assert.throws(() => repair.validatePlan(root, {
      patches:[{
        file:'src/pages/SystemCenter.jsx',
        replacements:[{ search:'stale block from previous version', replace:'x' }]
      }]
    }), /DEV_REPAIR_SEARCH_NOT_FOUND:src\/pages\/SystemCenter\.jsx/);
  } finally {
    fs.rmSync(root, { recursive:true, force:true });
  }
});

test('Autopilot refreshes stale version workspaces and retries bad sandbox plans', () => {
  const main = read('electron/main.cjs');
  assert.equal(main.includes('const refreshForVersion = Boolean(installedVersion && workspaceVersion && workspaceVersion !== installedVersion);'), true);
  assert.equal(main.includes('workspace-upgrade-'), true);
  assert.equal(main.includes("status:'SANDBOX_RETRY'"), true);
  assert.equal(main.includes('Do not reuse a stale replacement from a previous iteration.'), true);
  assert.equal(main.includes('Copy every search string verbatim from RELEVANT SOURCE'), true);
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

test('v0.3.12 release version is synchronized', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const versionSource = read('src/lib/appVersion.js');
  assert.equal(pkg.version, '0.3.12');
  assert.equal(lock.version, '0.3.12');
  assert.equal(lock.packages[''].version, '0.3.12');
  assert.equal(versionSource.includes("APP_VERSION = '0.3.12'"), true);
});
