import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { moduleHarness } from './helpers/runtime-module.js';

test('chat and voice run invoice → actual PDF → note through the real router, planner, executor and local adapter', async () => {
  for (const source of ['chat', 'voice']) {
    const storage = new Map(), downloads = [], approvals = [];
    class DownloadPDF extends jsPDF {
      constructor() {
        super();
        // jsPDF installs instance methods; only replace the browser download.
        this.save = filename => downloads.push({ filename, bytes: Buffer.from(this.output('arraybuffer')) });
      }
    }
    const h = moduleHarness({ stubs: {
      '@/lib/llmGateway': { invokeWithRetry: async () => ({ data: { result: {
        status: 'ready', steps: [
          { id: 'invoice', tool: 'create_invoice', params: { client_name: 'Buyer demo', items: [{ description: 'Service', quantity: 2, unit_price: 20 }] } },
          { id: 'pdf', tool: 'generate_pdf', params: { invoice_id: { $ref: 'invoice.data.id' } } },
          { id: 'note', tool: 'create_note', params: { title: 'Invoice reference', content: { $ref: 'invoice.data.invoice_number' } } },
        ],
      } } }) },
      '@/lib/logger': { logger: { info() {}, warn() {}, error() {} } },
      './languageEngine': {}, './ecosystemEngine': {},
      jspdf: { jsPDF: DownloadPDF },
      '@/lib/chatOrchestrator': {}, '@/lib/globalVoiceActions': {},
      '@/lib/commandIntents': {}, '@/lib/supportAssistant': {}, '@/lib/voiceCommandRouter': {},
      '@/lib/fastChatReplies': { findFastChatReply: () => null },
      '@/lib/codeAssistant': { isCodeAssistantRequest: () => false },
      '@/lib/globalVoiceNavigator': {},
    }, globals: { window: {
      localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
      confirm: label => { approvals.push(label); return true; },
    } } });
    const router = h.load('src/lib/CommandRouter.js');
    const result = await router.routeUserCommand({ text: 'Create an invoice then generate its PDF and save a note', source });
    assert.equal(result.intent, 'agent_task');
    assert.match(result.reply, /3\/3/);
    const { jarvis } = h.load('src/api/jarvisClient.js');
    const invoices = await jarvis.entities.Invoice.filter({});
    const notes = await jarvis.entities.Note.filter({});
    assert.equal(invoices.length, 1);
    assert.equal(invoices[0].total_amount, 40);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].content, invoices[0].invoice_number);
    assert.equal(result.actionResults[1].params.invoice_id, invoices[0].id);
    assert.equal(approvals.length, 2, 'invoice and PDF confirmations remain mandatory');
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].bytes.subarray(0, 5).toString(), '%PDF-');
    assert.equal(downloads[0].filename, invoices[0].invoice_number + '.pdf');
    const episodes = await jarvis.entities.AgentEpisode.filter({ kind: 'agent-run' });
    assert.equal(episodes[0].outcome, 'success');
    assert.equal(episodes[0].source, source);
  }
});
