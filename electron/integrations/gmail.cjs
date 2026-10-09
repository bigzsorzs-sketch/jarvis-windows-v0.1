'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const SCOPES = { read:'https://www.googleapis.com/auth/gmail.readonly', send:'https://www.googleapis.com/auth/gmail.send' };
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

function validateConfig(config = {}) {
  const client_id = String(config.client_id || '').trim();
  if (!/^[\w.-]{10,200}\.apps\.googleusercontent\.com$/.test(client_id)) throw new Error('GMAIL_CLIENT_ID_INVALID');
  const client_secret = String(config.client_secret || '').trim();
  if (client_secret.length > 500 || /[\r\n\x00]/.test(client_secret)) throw new Error('GMAIL_CLIENT_SECRET_INVALID');
  return { client_id, client_secret };
}
function recipients(to) {
  const items = (Array.isArray(to) ? to : String(to || '').split(/[,;]/)).map(v => String(v).trim());
  if (!items.length || items.length > 20 || items.some(v => !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(v))) throw new Error('GMAIL_RECIPIENT_INVALID');
  return items.join(', ');
}
function message(payload, email, messageId) {
  const to = recipients(payload.to);
  const subject = String(payload.subject || '');
  const body = String(payload.body || '');
  if (/[\r\n\x00]/.test(subject) || subject.length > 500 || Buffer.byteLength(body) > 2 * 1024 * 1024) throw new Error('GMAIL_MESSAGE_INVALID');
  const attachments = payload.attachments || [];
  if (!Array.isArray(attachments) || attachments.length > 10) throw new Error('GMAIL_ATTACHMENTS_INVALID');
  const boundary = 'jarvis_' + crypto.randomBytes(16).toString('hex');
  // Keep each RFC 2047 encoded word under 75 octets, without splitting UTF-8 characters.
  const words = []; let word = '';
  for (const character of subject) {
    if (Buffer.byteLength(word + character) > 42) { words.push(word); word = ''; }
    word += character;
  }
  words.push(word);
  const subjectHeader = words.map(part => `=?UTF-8?B?${Buffer.from(part).toString('base64')}?=`).join('\r\n ');
  const foldBase64 = bytes => bytes.toString('base64').replace(/.{1,76}/g, '$&\r\n').trimEnd();
  const lines = [`From: ${recipients(email)}`, `To: ${to.split(', ').join(',\r\n ')}`, `Subject: ${subjectHeader}`,
    `Message-ID: <${messageId}>`, 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', foldBase64(Buffer.from(body))];
  let size = Buffer.byteLength(body);
  for (const attachment of attachments) {
    const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-zA-Z0-9+/]*={0,2})$/.exec(String(attachment.file_url || ''));
    if (!match || !match[2] || match[2].length % 4 !== 0) throw new Error('GMAIL_ATTACHMENT_INVALID');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.toString('base64') !== match[2]) throw new Error('GMAIL_ATTACHMENT_INVALID');
    size += bytes.length;
    if (size > 20 * 1024 * 1024) throw new Error('GMAIL_ATTACHMENTS_TOO_LARGE');
    const filename = String(attachment.name || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150) || 'attachment';
    lines.push(`--${boundary}`, `Content-Type: ${match[1]}`, `Content-Disposition: attachment; filename="${filename}"`, 'Content-Transfer-Encoding: base64', '', foldBase64(bytes));
  }
  lines.push(`--${boundary}--`, '');
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a || '')); const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

class GmailConnector {
  constructor({ getConfig, getTokens, saveTokens, openExternal, getOperation, saveOperation, fetchImpl = globalThis.fetch, authTimeoutMs = 180000 }) {
    Object.assign(this, { getConfig, getTokens, saveTokens, openExternal, getOperation, saveOperation, fetchImpl, authTimeoutMs });
    this.connecting = false;
    this.refreshing = null;
    this.revision = 0;
    this.cancelConnect = null;
  }
  status() {
    const config = this.getConfig() || {};
    const tokens = this.getTokens() || {};
    return { configured:Boolean(config.client_id), connected:Boolean(tokens.refresh_token || tokens.access_token), email:tokens.email || null,
      capabilities:Object.entries(SCOPES).filter(([,scope]) => String(tokens.scope || '').split(' ').includes(scope)).map(([name]) => name) };
  }
  async request(url, options = {}) {
    const response = await this.fetchImpl(url, { ...options, redirect:'error', signal:AbortSignal.timeout(20000) });
    if (!response.ok) {
      const error = new Error(`GMAIL_HTTP_${response.status}`); error.status = response.status; throw error;
    }
    return response.json();
  }
  async connect(mode = 'read') {
    if (this.connecting) throw new Error('GMAIL_CONNECT_IN_PROGRESS');
    if (!['read', 'send', 'read_send'].includes(mode)) throw new Error('GMAIL_SCOPE_INVALID');
    const config = validateConfig(this.getConfig());
    const revision = ++this.revision;
    const prior = this.getTokens() || {};
    const requested = mode === 'read_send' ? Object.values(SCOPES) : [SCOPES[mode]];
    const scopes = [...new Set(['openid', 'email', ...String(prior.scope || '').split(' ').filter(s => Object.values(SCOPES).includes(s)), ...requested])];
    const state = crypto.randomBytes(32).toString('base64url');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    this.connecting = true;
    let server, timer;
    try {
      let redirect;
      const code = await new Promise((resolve, reject) => {
        let done = false;
        const finish = (error, value) => {
          if (done) return;
          done = true; clearTimeout(timer); server.close();
          if (error) reject(error); else resolve(value);
        };
        this.cancelConnect = () => finish(new Error('GMAIL_AUTH_CANCELLED'));
        server = http.createServer((req, res) => {
          if (req.method !== 'GET' || req.headers.host !== `127.0.0.1:${server.address()?.port}`) { res.writeHead(400).end(); return; }
          let url;
          try { url = new URL(req.url, redirect); } catch { res.writeHead(400).end(); return; }
          if (url.origin !== new URL(redirect).origin) { res.writeHead(400).end(); return; }
          if (url.pathname !== '/oauth/callback' || !safeEqual(url.searchParams.get('state'), state)) { res.writeHead(400).end('Invalid callback.'); return; }
          const error = url.searchParams.get('error');
          const value = url.searchParams.get('code');
          res.writeHead(200, { 'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store', 'Content-Security-Policy':"default-src 'none'" }).end('Return to Jarvis.');
          finish(error ? new Error('GMAIL_AUTH_DENIED') : !value || value.length > 4096 ? new Error('GMAIL_AUTH_CODE_INVALID') : null, value);
        });
        server.on('error', error => finish(error));
        server.listen(0, '127.0.0.1', () => {
          redirect = `http://127.0.0.1:${server.address().port}/oauth/callback`;
          const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
          for (const [key, value] of Object.entries({ client_id:config.client_id, redirect_uri:redirect, response_type:'code', scope:scopes.join(' '),
            state, code_challenge:challenge, code_challenge_method:'S256', access_type:'offline', prompt:'consent', include_granted_scopes:'true' })) url.searchParams.set(key, value);
          timer = setTimeout(() => finish(new Error('GMAIL_AUTH_TIMEOUT')), this.authTimeoutMs);
          Promise.resolve(this.openExternal(url.href)).catch(error => finish(error));
        });
      });
      const body = new URLSearchParams({ ...config, code, code_verifier:verifier, redirect_uri:redirect, grant_type:'authorization_code' });
      const tokens = await this.request('https://oauth2.googleapis.com/token', { method:'POST', body });
      if (!tokens.access_token || !Number.isFinite(Number(tokens.expires_in)) || Number(tokens.expires_in) <= 0) throw new Error('GMAIL_TOKEN_RESPONSE_INVALID');
      const granted = String(tokens.scope || '').split(' ');
      if (!requested.every(scope => granted.includes(scope))) throw new Error('GMAIL_SCOPE_NOT_GRANTED');
      const profile = await this.request('https://openidconnect.googleapis.com/v1/userinfo', { headers:{ Authorization:`Bearer ${tokens.access_token}` } });
      if (profile.email_verified !== true || !profile.sub) throw new Error('GMAIL_IDENTITY_NOT_VERIFIED');
      recipients(profile.email);
      if (this.revision !== revision) throw new Error('GMAIL_AUTH_CANCELLED');
      const refresh_token = tokens.refresh_token || (prior.account_id === profile.sub ? prior.refresh_token : null);
      if (!refresh_token) throw new Error('GMAIL_OFFLINE_GRANT_REQUIRED');
      this.saveTokens({ ...tokens, refresh_token, email:profile.email, account_id:profile.sub, expires_at:Date.now() + Number(tokens.expires_in) * 1000 });
      return { success:true, ...this.status() };
    } finally { clearTimeout(timer); server?.close(); this.connecting = false; this.cancelConnect = null; }
  }
  async accessToken(capability) {
    const tokens = this.getTokens() || {};
    if (!String(tokens.scope || '').split(' ').includes(SCOPES[capability])) throw new Error('GMAIL_SCOPE_REQUIRED_' + capability.toUpperCase());
    if (tokens.access_token && tokens.expires_at > Date.now() + 60000) return tokens.access_token;
    if (!tokens.refresh_token) throw new Error('GMAIL_RECONNECT_REQUIRED');
    if (!this.refreshing) {
      const revision = this.revision;
      this.refreshing = (async () => {
        const config = validateConfig(this.getConfig());
        const updated = await this.request('https://oauth2.googleapis.com/token', {
          method:'POST', body:new URLSearchParams({ ...config, refresh_token:tokens.refresh_token, grant_type:'refresh_token' }),
        });
        if (!updated.access_token || !Number.isFinite(Number(updated.expires_in)) || Number(updated.expires_in) <= 0) throw new Error('GMAIL_TOKEN_RESPONSE_INVALID');
        if (this.revision !== revision) throw new Error('GMAIL_AUTH_CANCELLED');
        this.saveTokens({ ...tokens, ...updated, expires_at:Date.now() + Number(updated.expires_in) * 1000 });
        return updated.access_token;
      })().finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }
  async fetchEmails(payload = {}) {
    const status = this.status();
    if (!status.connected) return { ...status, emails:[], reason:status.configured ? 'GMAIL_CONNECT_REQUIRED' : 'GMAIL_OAUTH_NOT_CONFIGURED' };
    const token = await this.accessToken('read');
    const limit = Math.max(1, Math.min(50, Number(payload.limit) || 25));
    const url = new URL(API + '/messages');
    url.searchParams.set('maxResults', String(Math.floor(limit))); url.searchParams.set('labelIds', 'INBOX');
    const headers = { Authorization:`Bearer ${token}` };
    const list = await this.request(url.href, { headers });
    const messages = Array.isArray(list.messages) ? list.messages.slice(0, Math.floor(limit)) : [];
    const emails = [];
    // Bound concurrency, payload and privileged metadata reads.
    for (let i = 0; i < messages.length; i += 5) {
      const batch = await Promise.all(messages.slice(i, i + 5).map(async item => {
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(String(item.id || ''))) throw new Error('GMAIL_MESSAGE_ID_INVALID');
        const result = await this.request(API + '/messages/' + item.id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date', { headers });
        const header = name => (result.payload?.headers || []).find(h => String(h.name).toLowerCase() === name)?.value || '';
        return { id:result.id, threadId:result.threadId, from:header('from'), subject:header('subject'), date:header('date'), snippet:result.snippet || '',
          unread:(result.labelIds || []).includes('UNREAD'), starred:(result.labelIds || []).includes('STARRED') };
      }));
      emails.push(...batch);
    }
    return { ...this.status(), emails, success:true };
  }
  async send(payload = {}) {
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(String(payload.operation_id || ''))) throw new Error('GMAIL_OPERATION_ID_REQUIRED');
    const status = this.status();
    if (!status.connected) throw new Error('GMAIL_CONNECT_REQUIRED');
    const messageId = payload.operation_id + '@jarvis.local';
    const raw = message(payload, status.email, messageId);
    const hash = crypto.createHash('sha256').update(JSON.stringify({ email:status.email, to:recipients(payload.to), subject:String(payload.subject || ''), body:String(payload.body || ''), attachments:payload.attachments || [] })).digest('hex');
    const replay = previous => {
      if (previous.hash !== hash) throw new Error('GMAIL_OPERATION_ID_CONFLICT');
      return previous.status === 'sent' ? { success:true, sent:true, id:previous.provider_id, replayed:true }
        : { success:false, sent:false, unknownOutcome:previous.status === 'pending', reason:previous.reason || 'GMAIL_SEND_OUTCOME_UNKNOWN', messageId };
    };
    const previous = this.getOperation(payload.operation_id);
    if (previous) return replay(previous);
    const revision = this.revision;
    const token = await this.accessToken('send');
    if (this.revision !== revision) throw new Error('GMAIL_AUTH_CANCELLED');
    const afterRefresh = this.getOperation(payload.operation_id);
    if (afterRefresh) return replay(afterRefresh);
    this.saveOperation(payload.operation_id, { hash, status:'pending', messageId, email:status.email });
    try {
      const result = await this.request(API + '/messages/send', { method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body:JSON.stringify({ raw }) });
      if (!result.id || typeof result.id !== 'string') throw new Error('GMAIL_SEND_ACK_MISSING');
      if (this.revision === revision) this.saveOperation(payload.operation_id, { hash, status:'sent', provider_id:result.id, messageId, email:status.email });
      return { success:true, sent:true, id:result.id, messageId };
    } catch (error) {
      const rejected = error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
      const reason = rejected ? error.message : 'GMAIL_SEND_OUTCOME_UNKNOWN';
      if (this.revision === revision) this.saveOperation(payload.operation_id, { hash, status:rejected ? 'rejected' : 'pending', reason, messageId, email:status.email });
      return { success:false, sent:false, unknownOutcome:!rejected, reason, messageId };
    }
  }
  async disconnect() {
    this.cancelPending();
    const tokens = this.getTokens() || {};
    const token = tokens.refresh_token || tokens.access_token;
    this.saveTokens(null);
    let revoked = !token;
    if (token) {
      try { const response = await this.fetchImpl('https://oauth2.googleapis.com/revoke', { method:'POST', body:new URLSearchParams({ token }), redirect:'error', signal:AbortSignal.timeout(10000) }); revoked = response.ok; } catch {}
    }
    return { success:true, disconnected:true, revoked };
  }
  cancelPending() { this.revision++; this.cancelConnect?.(); }
}

module.exports = { GmailConnector, validateConfig, message, recipients, SCOPES };
