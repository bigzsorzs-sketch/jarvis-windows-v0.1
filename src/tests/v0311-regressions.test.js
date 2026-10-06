import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');

test('agent-visible financial actions require confirmation consistently', () => {
  const registry = read('src/lib/capabilityRegistry.js');
  assert.match(registry, /tool:'create_invoice'.*approval:'confirm'/);
  assert.match(registry, /tool:'generate_pdf'.*approval:'confirm'/);
});

test('Electron external navigation supports safe communication protocols', () => {
  const main = read('electron/main.cjs');
  assert.equal(main.includes("new Set(['http:','https:','mailto:','tel:','sms:'])"), true);
});

test('invoice PDF export is local and cannot call a missing backend function', () => {
  const invoice = read('src/pages/tools/InvoiceTool.jsx');
  assert.equal(invoice.includes("invoke('exportInvoicePdf'"), false);
  assert.equal(invoice.includes('new jsPDF()'), true);
  assert.equal(invoice.includes('finally {\n      setPdfLoading(null);'), true);
});

test('notification manager no longer calls an unimplemented backend or depends on a service worker', () => {
  const notifications = read('src/components/jarvis/PushNotificationManager.jsx');
  assert.equal(notifications.includes("invoke('sendPushNotifications'"), false);
  assert.equal(notifications.includes('navigator.serviceWorker.ready'), false);
  assert.equal(notifications.includes('new Notification('), true);
});

test('voice runtime removes network and visibility subscriptions on destroy', () => {
  const voice = read('src/lib/voiceRuntime.js');
  assert.equal(voice.includes('this.networkUnsubscribeRef = networkMonitor.subscribe'), true);
  assert.equal(voice.includes("document.removeEventListener('visibilitychange', this.visibilityHandlerRef)"), true);
  assert.equal(voice.includes('if (this.cycleTimeoutRef) clearTimeout(this.cycleTimeoutRef);'), true);
});

test('route queue is single-flight and does not truncate pending actions', () => {
  const route = read('src/lib/routeOfflineQueue.js');
  const queue = read('src/lib/offlineActionQueue.js');
  assert.equal(route.includes('let routeSyncing = false;'), true);
  assert.equal(route.includes('if (!networkMonitor.isOnline() || routeSyncing) return;'), true);
  assert.equal(route.includes('routeSyncing = false;'), true);
  assert.equal(queue.includes('return Array.isArray(queue) ? queue : [];'), true);
  assert.equal(queue.includes('queue.slice('), false);
});

test('low-power navigation sessions use the extended timeout', () => {
  const config = read('src/lib/appConfig.js');
  const nav = read('src/lib/navigationTracker.js');
  assert.equal(config.includes('ROUTE_LOW_POWER_SESSION_TIMEOUT_MS: 12 * 60 * 60 * 1000'), true);
  assert.equal(nav.includes("parsed.tracking_mode === 'LOW_POWER'"), true);
});

test('OBD scanner prevents overlapping interval ticks and duplicate finalization', () => {
  const obd = read('src/pages/OBD2Scanner.jsx');
  assert.equal(obd.includes('let tickRunning = false;'), true);
  assert.equal(obd.includes('let finalized = false;'), true);
  assert.equal(obd.includes('if (tickRunning || finalized) return;'), true);
  assert.equal(obd.includes('if (elapsedMs > 30000 && !finalized)'), true);
});

test('date-sensitive active modules use local calendar dates', () => {
  for (const file of [
    'src/pages/tools/InvoiceTool.jsx',
    'src/pages/tools/FinanceTool.jsx',
    'src/pages/Eszkozok.jsx',
    'src/pages/Muszerfal.jsx',
    'src/pages/Jelentesek.jsx',
    'src/pages/Contacts.jsx',
    'src/pages/Retail.jsx',
    'src/components/fuel/FuelLogForm.jsx',
    'src/lib/behaviorEngine.js',
    'src/lib/intelligentReminderEngine.js',
    'src/lib/assistantBrain.js',
  ]) {
    const source = read(file);
    assert.equal(source.includes("toISOString().split('T')[0]"), false, file);
    assert.equal(source.includes("toISOString().slice(0, 10)"), false, file);
  }
});

test('manual Self-Repair validates in staging and never activates unmerged code locally', () => {
  const main = read('electron/main.cjs');
  assert.equal(main.includes('ensureManualRuntimeBuilt'), true);
  const builderStart = main.indexOf('async function ensureManualRuntimeBuilt(');
  const builderEnd = main.indexOf('function clearLegacyManualRuntimeState(',builderStart);
  const builder = main.slice(builderStart,builderEnd);
  assert.ok(builderStart >= 0 && builderEnd > builderStart);
  assert.match(builder,/const checkNpm = async/);
  assert.match(builder,/await runToolchainNpm\(\['run',command\]/);
  assert.match(builder,/await checkNpm\('build'\)/);
  assert.match(builder,/enabled:false/);
  assert.equal(main.includes('scheduleManualRuntimeRestart'), false);
  assert.equal(main.includes("'--jarvis-manual-runtime'"), false);
  assert.match(main,/await client\.createRepairPullRequest/);
});

test('desktop command center keeps centered alignment and app version stays synchronized', () => {
  const css = read('src/styles/command-center.css');
  const appVersion = read('src/lib/appVersion.js');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(css.includes('align-items:center;'), true);
  assert.equal(css.includes('jarvis-command-center-hero'), true);
  assert.equal(appVersion.includes(`APP_VERSION = '${pkg.version}'`), true);
});
