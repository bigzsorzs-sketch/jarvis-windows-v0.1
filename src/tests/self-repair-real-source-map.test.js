import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repair = require('../../electron/developer-repair.cjs');

test('the real application map identifies the Self-Repair route and Electron preload as active', () => {
  const map = repair.inspectWorkspace(process.cwd());
  assert.equal(map.architecture.reachability['src/pages/SystemCenter.jsx'], 'renderer-active');
  assert.equal(map.architecture.reachability['electron/preload.cjs'], 'main-active');
  assert.ok(map.architecture.routes.some(route => route.route === '/system-center' && route.file === 'src/pages/SystemCenter.jsx'));
});

test('explicitly named diagnostic files are included before general keyword matches consume the source budget', () => {
  const names = ['src/pages/Beallitasok.jsx', 'src/lib/ownedEntityHelpers.js', 'src/pages/SystemCenter.jsx'];
  const context = repair.buildDiagnosticContext(process.cwd(), names.join(' ') + ' t.get is not a function hibás adatok', { maxFiles:20, maxChars:62000 });
  const selected = new Set(context.excerpts.map(item => item.path));
  for (const file of names) assert.ok(selected.has(file), 'requested source was omitted: ' + file);
  const helper = context.excerpts.find(item => item.path === 'src/lib/ownedEntityHelpers.js');
  assert.equal(helper.complete, true);
  assert.equal(helper.excerpt, fs.readFileSync('src/lib/ownedEntityHelpers.js', 'utf8'));
});

test('large import graphs keep their final lazy route and literal preload dependency', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-large-source-map-'));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  fs.mkdirSync(path.join(root, 'src', 'pages'), { recursive:true });
  fs.mkdirSync(path.join(root, 'electron'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name:'jarvis-desktop', version:'0.3.25' }));
  const imports = [];
  for (let i = 0; i < 60; i += 1) {
    imports.push(`const Page${i} = lazy(() => import('./pages/Page${i}.jsx'));`);
    fs.writeFileSync(path.join(root, 'src', 'pages', `Page${i}.jsx`), `export default function Page${i}(){return null;}`);
  }
  fs.writeFileSync(path.join(root, 'src', 'App.jsx'), imports.join('\n') + '\nexport default function App(){return <Route path="/last" element={<Page59/>}/>;}');
  fs.writeFileSync(path.join(root, 'electron', 'main.cjs'), "new BrowserWindow({webPreferences:{preload:path.join(__dirname,'preload.cjs')}});");
  fs.writeFileSync(path.join(root, 'electron', 'preload.cjs'), "ipcRenderer.invoke('x:test');");
  const map = repair.inspectWorkspace(root);
  assert.equal(map.architecture.reachability['src/pages/Page59.jsx'], 'renderer-active');
  assert.equal(map.architecture.reachability['electron/preload.cjs'], 'main-active');
});
