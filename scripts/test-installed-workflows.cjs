'use strict';

// Uses the real NSIS install, packaged renderer, preload, policy and SQLite.
// No permissions are bypassed, no provider requests or physical commands are sent.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

if (process.platform !== 'win32') { console.log('Installed Windows workflow checks require Windows.'); process.exit(0); }
const installer = path.resolve(process.argv[2] || `release/Jarvis-Setup-${require('../package.json').version}-x64.exe`);
if (!fs.existsSync(installer)) throw new Error('INSTALLER_MISSING');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-acceptance-'));
const install = path.join(root, 'installed');
const profile = path.join(root, 'profile');
fs.mkdirSync(profile, { recursive:true });
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ language:'hu', aiProvider:'openrouter' }));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let child, socket;
const report = { version:require('../package.json').version, started_at:new Date().toISOString(), steps:[], provider_calls:false, hardware_calls:false };
function done(name) { report.steps.push({ name, success:true }); console.log('Installed workflow OK:', name); }
function run(exe, args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const process = spawn(exe, args, { windowsHide:true, stdio:'ignore' });
    const timer = setTimeout(() => { process.kill(); reject(new Error('PROCESS_TIMEOUT')); }, timeout);
    process.on('error', error => { clearTimeout(timer); reject(error); });
    process.on('exit', code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error('PROCESS_EXIT_' + code)); });
  });
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
async function launch() {
  const port = await freePort();
  const exe = path.join(install, 'Jarvis.exe');
  child = spawn(exe, ['--jarvis-profile=' + profile, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port, '--disable-gpu', '--disable-gpu-sandbox'], { windowsHide:true, stdio:'ignore' });
  let spawnError;
  child.once('error', error => { spawnError = error; });
  let target;
  for (let i = 0; i < 60; i++) {
    if (spawnError) throw spawnError;
    if (child.exitCode != null) throw new Error('INSTALLED_APP_EXIT_' + child.exitCode);
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`, { signal:AbortSignal.timeout(1000) }).then(r => r.json());
      target = targets.find(t => t.type === 'page' && t.url.startsWith('file:'));
      if (target?.webSocketDebuggerUrl) break;
    } catch {}
    await wait(500);
  }
  if (!target?.webSocketDebuggerUrl) throw new Error('INSTALLED_RENDERER_NOT_READY');
  const endpoint = new URL(target.webSocketDebuggerUrl);
  if (!['127.0.0.1','localhost'].includes(endpoint.hostname) || Number(endpoint.port) !== port) throw new Error('DEBUG_ENDPOINT_NOT_LOCAL');
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once:true }); socket.addEventListener('error', reject, { once:true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const result = JSON.parse(String(event.data));
    const request = pending.get(result.id);
    if (!request) return;
    pending.delete(result.id); clearTimeout(request.timer);
    if (result.error) request.reject(new Error(result.error.message)); else request.resolve(result.result);
  });
  socket.addEventListener('close', () => { for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('DEBUG_CONNECTION_CLOSED')); } pending.clear(); });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('DEBUG_COMMAND_TIMEOUT:' + method)); }, 30000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise:true, returnByValue:true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  for (let i = 0; i < 60; i++) {
    if (await evaluate('Boolean(window.jarvisDesktop?.data && document.querySelector("#root")?.children.length)')) break;
    if (i === 59) throw new Error('INSTALLED_PRELOAD_OR_REACT_NOT_READY');
    await wait(250);
  }
  return { evaluate, command };
}
async function stop() {
  socket?.close();
  if (child && child.exitCode == null && child.signalCode == null) {
    child.kill();
    for (let i = 0; i < 40 && child.exitCode == null && child.signalCode == null; i++) await wait(100);
    if (child.exitCode == null && child.signalCode == null) throw new Error('INSTALLED_APP_DID_NOT_STOP');
  }
}

(async () => {
  try {
    await run(installer, ['/S', '/D=' + install]);
    assert.ok(fs.existsSync(path.join(install, 'Jarvis.exe')));
    done('NSIS installation into isolated directory');
    let runtime = await launch();
    const result = await runtime.evaluate(`(async () => {
      const bridge = window.jarvisDesktop;
      const user = await bridge.data.getUser();
      const business = await bridge.data.create('Business', { name:'Acceptance shop', revenue_monthly:99999 });
      const product = await bridge.data.create('RetailProduct', { name:'Acceptance product', price:10, cost:6, stock:10, business_id:business.id });
      const request = { product_id:product.id, quantity:2, discount:20, date:'2026-10-08', operation_id:'installed-retail-sale-0001' };
      const sale = await bridge.data.recordRetailSale(request);
      const repeat = await bridge.data.recordRetailSale(request);
      const note = await bridge.data.create('Note', { title:'Acceptance note', content:'Persistence verified' });
      const invoice = await bridge.data.create('Invoice', { invoice_number:'ACCEPTANCE-001', client_name:'Fixture customer', items:[{ description:'Service', quantity:1, unit_price:25 }], status:'kiallitva', business_id:business.id });
      const payment = await bridge.data.recordInvoicePayment({ invoice_id:invoice.id, operation_id:'installed-invoice-payment-0001', date:'2026-10-08' });
      const email = await bridge.invokeFunction('gmailStatus', {});
      await bridge.saveSettings({ language:'hu', aiModel:'openrouter/auto' });
      return { user, product, sale, repeat, note, invoice, payment, email:email.data, database:await bridge.data.stats() };
    })()`);
    assert.equal(result.sale.success, true);
    assert.equal(result.sale.sale.revenue, 16);
    assert.equal(result.sale.sale.profit, 4);
    assert.equal(result.sale.product.stock, 8);
    assert.equal(result.repeat.sale.id, result.sale.sale.id);
    assert.equal(result.payment.entry.amount, 25);
    assert.equal(result.email.connected, false);
    assert.equal(result.database.integrity, 'ok');
    assert.ok(path.resolve(result.database.databasePath).startsWith(path.resolve(profile) + path.sep));
    done('real preload/IPC/policy/SQLite sale, duplicate prevention, invoice payment and settings');
    for (const [route, text] of [['retail','Acceptance product'], ['tools/invoices','ACCEPTANCE-001'], ['tools/finance','Számlafizetés'], ['holding','Acceptance shop'], ['gmail','Gmail']]) {
      await runtime.evaluate(`location.hash = '#/${route}'`);
      let found = false;
      for (let i = 0; i < 40; i++) {
        found = await runtime.evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`);
        if (found) break; await wait(250);
      }
      assert.ok(found, 'Installed screen failed: ' + route);
      done('installed renderer screen: ' + route);
    }
    const screenshot = await runtime.command('Page.captureScreenshot', { format:'png' });
    fs.mkdirSync('release', { recursive:true });
    fs.writeFileSync('release/windows-acceptance.png', Buffer.from(screenshot.data, 'base64'));
    await stop();
    runtime = await launch();
    const persisted = await runtime.evaluate(`(async () => {
      const d = window.jarvisDesktop.data;
      const products = await d.filter('RetailProduct', {}, null, null);
      const sales = await d.filter('RetailSale', {}, null, null);
      const entries = await d.filter('FinanceEntry', {}, null, null);
      const notes = await d.filter('Note', {}, null, null);
      const settings = await window.jarvisDesktop.getSettings();
      return { products, sales, entries, notes, settings };
    })()`);
    assert.equal(persisted.products[0].stock, 8);
    assert.equal(persisted.sales.length, 1);
    assert.equal(persisted.entries.length, 2);
    assert.equal(persisted.notes[0].content, 'Persistence verified');
    assert.equal(persisted.settings.language, 'hu');
    done('installed app restart preserves records and settings');
    await stop();
    const uninstaller = path.join(install, 'Uninstall Jarvis.exe');
    assert.ok(fs.existsSync(uninstaller));
    await run(uninstaller, ['/S'], 90000);
    for (let i = 0; i < 60 && fs.existsSync(path.join(install, 'Jarvis.exe')); i++) await wait(500);
    assert.equal(fs.existsSync(path.join(install, 'Jarvis.exe')), false);
    done('NSIS uninstall removes the installed executable');
    report.success = true;
  } catch (error) {
    report.success = false; report.error = String(error.stack || error);
    console.error(report.error); process.exitCode = 1;
  } finally {
    await stop().catch(() => {});
    report.finished_at = new Date().toISOString();
    fs.mkdirSync('release', { recursive:true });
    fs.writeFileSync('release/windows-acceptance.json', JSON.stringify(report, null, 2));
    fs.rmSync(root, { recursive:true, force:true });
  }
})();
