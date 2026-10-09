import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { GmailConnector, SCOPES, message } = require('../../electron/integrations/gmail.cjs');
const config = { client_id:'jarvis-test-client.apps.googleusercontent.com', client_secret:'fixture-client-secret' };
const response = (data, status = 200) => ({ ok:status >= 200 && status < 300, status, json:async () => data });

function fixture(overrides = {}) {
  let tokens = { email:'sender@example.test', account_id:'test-sub', access_token:'fixture-access', refresh_token:'fixture-refresh', scope:Object.values(SCOPES).join(' '), expires_at:Date.now() + 3600000 };
  const operations = new Map();
  const connector = new GmailConnector({ getConfig:() => config, getTokens:() => tokens, saveTokens:value => { tokens = value; },
    getOperation:id => operations.get(id), saveOperation:(id,row) => operations.set(id,row), openExternal:async () => {},
    fetchImpl:async () => { throw new Error('UNEXPECTED_NETWORK_REQUEST'); }, ...overrides });
  return { connector, getTokens:() => tokens, setTokens:value => { tokens = value; }, operations };
}

test('real loopback OAuth rejects incorrect state and binds authorization code to PKCE', async () => {
  let authorization;
  const f = fixture({
    openExternal:async href => {
      authorization = new URL(href);
      assert.equal(authorization.origin, 'https://accounts.google.com');
      assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
      assert.ok(!href.includes(config.client_secret));
      const callback = new URL(authorization.searchParams.get('redirect_uri'));
      assert.equal(callback.hostname, '127.0.0.1');
      callback.searchParams.set('state', 'incorrect-state'); callback.searchParams.set('code', 'fixture-code');
      assert.equal((await fetch(callback)).status, 400);
      callback.searchParams.set('state', authorization.searchParams.get('state'));
      assert.equal((await fetch(callback)).status, 200);
    },
    fetchImpl:async (url, options) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        const p = options.body;
        assert.equal(p.get('code'), 'fixture-code');
        assert.equal(p.get('redirect_uri'), authorization.searchParams.get('redirect_uri'));
        assert.equal(crypto.createHash('sha256').update(p.get('code_verifier')).digest('base64url'), authorization.searchParams.get('code_challenge'));
        return response({ access_token:'fixture-access', refresh_token:'fixture-refresh', expires_in:3600, scope:Object.values(SCOPES).join(' ') });
      }
      assert.equal(url, 'https://openidconnect.googleapis.com/v1/userinfo');
      return response({ email:'sender@example.test', email_verified:true, sub:'test-sub' });
    },
  });
  f.setTokens(null);
  const result = await f.connector.connect('read_send');
  assert.equal(result.connected, true);
  assert.deepEqual(result.capabilities, ['read', 'send']);
  assert.equal(f.getTokens().email, 'sender@example.test');
});

test('OAuth timeout and user denial close the listener and never store tokens', async () => {
  const timed = fixture({ authTimeoutMs:25 }); timed.setTokens(null);
  await assert.rejects(timed.connector.connect(), /AUTH_TIMEOUT/);
  assert.equal(timed.connector.connecting, false);
  assert.equal(timed.getTokens(), null);
  const denied = fixture({ openExternal:async href => {
    const a = new URL(href); const callback = new URL(a.searchParams.get('redirect_uri'));
    callback.searchParams.set('state', a.searchParams.get('state')); callback.searchParams.set('error', 'access_denied');
    await fetch(callback);
  } });
  denied.setTokens(null);
  await assert.rejects(denied.connector.connect(), /AUTH_DENIED/);
  assert.equal(denied.getTokens(), null);
});

test('refresh is shared across concurrent reads and canceled refresh cannot restore disconnected credentials', async () => {
  let calls = 0, resolve;
  const f = fixture({ fetchImpl:async () => { calls++; return new Promise(r => { resolve = r; }); } });
  f.setTokens({ ...f.getTokens(), expires_at:0 });
  const a = f.connector.accessToken('read'); const b = f.connector.accessToken('read');
  resolve(response({ access_token:'refreshed', expires_in:3600 }));
  assert.deepEqual(await Promise.all([a,b]), ['refreshed','refreshed']);
  assert.equal(calls, 1);
  f.setTokens({ ...f.getTokens(), expires_at:0 });
  const pending = f.connector.accessToken('read');
  f.connector.cancelPending(); f.setTokens(null);
  resolve(response({ access_token:'must-not-return', expires_in:3600 }));
  await assert.rejects(pending, /AUTH_CANCELLED/);
  assert.equal(f.getTokens(), null);
});

test('mail listing uses authenticated bounded metadata requests and maps provider receipts', async () => {
  const urls = [];
  const f = fixture({ fetchImpl:async (url, options) => {
    urls.push(url); assert.equal(options.headers.Authorization, 'Bearer fixture-access');
    if (url.includes('/messages?')) return response({ messages:[{ id:'a1' }] });
    return response({ id:'a1', threadId:'t1', snippet:'preview', labelIds:['UNREAD'], payload:{ headers:[{ name:'From', value:'friend@example.test' }, { name:'Subject', value:'Fixture' }] } });
  } });
  const r = await f.connector.fetchEmails({ limit:50000 });
  assert.equal(new URL(urls[0]).searchParams.get('maxResults'), '50');
  assert.equal(r.emails[0].subject, 'Fixture');
  assert.equal(r.emails[0].unread, true);
});

test('MIME carries the actual PDF bytes, Unicode text and protected headers', () => {
  const pdf = Buffer.from('%PDF-1.4\nfixture\n%%EOF');
  const raw = message({ to:'recipient@example.test', subject:'Számla', body:'Köszönöm', attachments:[{ name:'invoice.pdf', file_url:'data:application/pdf;base64,' + pdf.toString('base64') }] }, 'sender@example.test', 'fixture@jarvis.local');
  const mime = Buffer.from(raw, 'base64url').toString();
  assert.ok(mime.includes('filename="invoice.pdf"'));
  assert.ok(mime.includes(pdf.toString('base64')));
  assert.ok(mime.includes(Buffer.from('Köszönöm').toString('base64')));
  assert.throws(() => message({ to:'victim@example.test\r\nBcc:other@example.test' }, 'sender@example.test', 'x'), /RECIPIENT_INVALID/);
  assert.throws(() => message({ to:'recipient@example.test', subject:'x\r\nBcc:y' }, 'sender@example.test', 'x'), /MESSAGE_INVALID/);
  const long = Buffer.from(message({ to:'recipient@example.test', subject:'Ő'.repeat(400), body:'Long body '.repeat(1000) }, 'sender@example.test', 'x'), 'base64url').toString();
  assert.ok(long.split('\r\n').every(line => line.length <= 998), 'MIME transport lines fit the RFC limit');
  const decodedSubject = [...long.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map(match => Buffer.from(match[1], 'base64').toString()).join('');
  assert.equal(decodedSubject, 'Ő'.repeat(400));
});

test('successful send has a provider ID and duplicate/concurrent requests never send twice', async () => {
  let sends = 0;
  const f = fixture({ fetchImpl:async () => { sends++; return response({ id:'provider-receipt-1' }); } });
  const request = { operation_id:'gmail-operation-0001', to:'recipient@example.test', subject:'Fixture', body:'Fixture message' };
  const [a,b] = await Promise.all([f.connector.send(request), f.connector.send(request)]);
  assert.equal(a.sent, true);
  assert.ok(b.unknownOutcome === true || b.sent === true);
  assert.equal((await f.connector.send(request)).id, 'provider-receipt-1');
  assert.equal(sends, 1);
  await assert.rejects(f.connector.send({ ...request, body:'changed' }), /OPERATION_ID_CONFLICT/);
});

test('missing acknowledgment, timeout and server failure preserve uncertain outcome without resend', async () => {
  for (const fail of [async () => response({}), async () => { throw new Error('connection lost after delivery'); }, async () => response({}, 500)]) {
    let sends = 0;
    const f = fixture({ fetchImpl:async (...args) => { sends++; return fail(...args); } });
    const request = { operation_id:'gmail-operation-0002', to:'recipient@example.test', body:'Fixture' };
    assert.equal((await f.connector.send(request)).unknownOutcome, true);
    assert.equal((await f.connector.send(request)).unknownOutcome, true);
    assert.equal(sends, 1);
  }
});

test('missing send scope never transmits and disconnect removes local credentials even if revoke fails', async () => {
  const f = fixture(); f.setTokens({ ...f.getTokens(), scope:SCOPES.read });
  await assert.rejects(f.connector.send({ operation_id:'gmail-operation-0003', to:'recipient@example.test' }), /SCOPE_REQUIRED_SEND/);
  assert.equal(f.operations.size, 0);
  const r = await f.connector.disconnect();
  assert.equal(r.disconnected, true); assert.equal(r.revoked, false);
  assert.equal(f.getTokens(), null);
});
