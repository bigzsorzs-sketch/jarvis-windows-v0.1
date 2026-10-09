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

test('invoice email carries generated PDF bytes and reports partial work when Gmail delivery is uncertain', async () => {
  for (const delivered of [true, false]) {
    const storage = new Map(), requests = [], downloads = [];
    class DownloadPDF extends jsPDF {
      constructor() { super(); this.save = name => downloads.push(name); }
    }
    const h = moduleHarness({ stubs:{ jspdf:{ jsPDF:DownloadPDF }, '@/lib/logger':{ logger:{ warn(){}, info(){}, error(){} } }, './languageEngine':{}, './ecosystemEngine':{} },
      globals:{ window:{ localStorage:{ getItem:key => storage.get(key) ?? null, setItem:(key,value) => storage.set(key,value) },
        jarvisDesktop:{ invokeFunction:async (name,payload) => {
          requests.push({ name, payload });
          return { data:delivered ? { success:true, sent:true, id:'fixture-provider-id' } : { success:false, sent:false, unknownOutcome:true } };
        } } } } });
    const tools = h.load('src/lib/assistantTools.js').TOOLS;
    const result = await tools.create_invoice_and_email({ client_name:'Buyer fixture', client_email:'buyer@example.test', items:[{ description:'Service', quantity:2, unit_price:20 }] });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].name, 'gmailSend');
    assert.ok(requests[0].payload.operation_id);
    const url = requests[0].payload.attachments[0].file_url;
    assert.equal(Buffer.from(url.split(',')[1], 'base64').subarray(0,5).toString(), '%PDF-');
    assert.equal(result.success, delivered);
    assert.equal(result.unknownOutcome, !delivered);
    assert.equal(result.data.invoice.total_amount, 40);
    assert.equal(downloads.length, 1);
  }
});

test('draft email only hands off to the mail client and never calls Gmail send', async () => {
  const storage = new Map(), opened = [];
  const h = moduleHarness({ stubs:{ '@/lib/logger':{ logger:{ warn(){} } }, './languageEngine':{}, './ecosystemEngine':{} }, globals:{ window:{
    localStorage:{ getItem:key => storage.get(key) ?? null, setItem:(key,value) => storage.set(key,value) },
    jarvisDesktop:{ openExternal:async url => { opened.push(url); return { success:true, accepted:true }; }, invokeFunction:async () => { throw new Error('DRAFT_MUST_NOT_SEND'); } },
  } } });
  const result = await h.load('src/lib/assistantTools.js').TOOLS.draft_email({ to:'buyer@example.test', subject:'Fixture', body:'Fixture body' });
  assert.equal(result.success, true);
  assert.equal(result.data.sent, false);
  assert.equal(opened.length, 1);
  assert.ok(opened[0].startsWith('mailto:'));
});
