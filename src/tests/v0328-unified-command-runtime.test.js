import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('v0.3.28 wires the real Live Assistant and prevents duplicate global voice ownership', () => {
  const app = read('src/App.jsx');
  const layout = read('src/components/Layout.jsx');
  assert.match(app, /LiveAssistant = lazy/);
  assert.match(app, /path="\/live-assistant" element={<LiveAssistant \/>}/);
  assert.match(layout, /location\.pathname !== '\/live-assistant'/);
});

test('typed and spoken commands share the same global UI resolver', () => {
  const router = read('src/lib/CommandRouter.js');
  const chat = read('src/pages/Chat.jsx');
  const live = read('src/pages/LiveAssistant.jsx');
  const registry = read('src/lib/capabilityRegistry.js');
  assert.match(router, /resolveGlobalUiCommand/);
  assert.match(router, /uiCommand:globalUiCommand/);
  assert.match(chat, /executeResolvedGlobalUiCommand\(routed\.uiCommand/);
  assert.match(live, /executeResolvedGlobalUiCommand\(routed\.uiCommand/);
  assert.match(registry, /eszköztár/);
  assert.match(registry, /eszkoztar/);
});

test('search_data covers core Jarvis modules beyond notes and contacts', () => {
  const tools = read('src/lib/assistantTools.js');
  for (const entity of ['Invoice','FinanceEntry','BloodSugar','MealLog','SmartDevice','Scene','Routine','Business','VehicleProfile']) {
    assert.equal(tools.includes(`'${entity}'`), true, `search_data missing ${entity}`);
  }
  assert.match(tools, /safeStringify\(row, 20000\)/);
});

test('call_contact resolves a stored contact and refuses false success without a number', () => {
  const tools = read('src/lib/assistantTools.js');
  assert.match(tools, /Contact\.search/);
  assert.match(tools, /Nem találok telefonszámot/);
  assert.match(tools, /success:false/);
});

test('combined invoice flow creates invoice, generates PDF, then prepares email', () => {
  const tools = read('src/lib/assistantTools.js');
  const start = tools.indexOf('create_invoice_and_email: async');
  const end = tools.indexOf('\n  log_blood_sugar:', start);
  const combined = tools.slice(start, end);
  const invoiceAt = combined.indexOf('TOOLS.create_invoice');
  const pdfAt = combined.indexOf('TOOLS.generate_pdf');
  const emailAt = combined.indexOf('TOOLS.draft_email');
  assert.ok(invoiceAt >= 0 && pdfAt > invoiceAt && emailAt > pdfAt);
  assert.match(combined, /közvetlen Gmail-küldés nincs konfigurálva/);
});

test('PDF generation returns the concrete filename for downstream workflows', () => {
  const tools = read('src/lib/assistantTools.js');
  assert.match(tools, /const fileName = `\$\{inv\.invoice_number\}\.pdf`/);
  assert.match(tools, /data:\{ invoice:inv, fileName \}/);
});
