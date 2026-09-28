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

test('route queue is single-flight and preserves route starts under pressure', () => {
  const route = read('src/lib/routeOfflineQueue.js');
  const queue = read('src/lib/offlineActionQueue.js');
  assert.equal(route.includes('let routeSyncing = false;'), true);
  assert.equal(route.includes('if (!networkMonitor.isOnline() || routeSyncing) return;'), true);
  assert.equal(route.includes('routeSyncing = false;'), true);
  assert.equal(queue.includes("item?.type === 'route_start'"), true);
  assert.equal(queue.includes('ROUTE_START_RESERVE'), true);
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

test('Self-Repair sandbox cleanup tolerates transient Windows file locks', () => {
  const repair = read('electron/developer-repair.cjs');
  assert.equal(repair.includes('maxRetries:8'), true);
  assert.equal(repair.includes("['EPERM','EBUSY','ENOTEMPTY','EACCES']"), true);
  assert.equal(repair.includes('.pending-delete-'), true);
});

test('desktop command center has final alignment override and release version is synchronized', () => {
  const css = read('src/styles/command-center.css');
  const appVersion = read('src/lib/appVersion.js');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(css.includes('v0.3.11 — desktop command-center alignment'), true);
  assert.equal(css.includes('align-items:center;'), true);
  assert.equal(appVersion.includes("APP_VERSION = '0.3.11'"), true);
  assert.equal(pkg.version, '0.3.11');
});
