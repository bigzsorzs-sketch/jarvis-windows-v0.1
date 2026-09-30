import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateUploadedFileUrl, MAX_FILE_BYTES } = require('../../electron/analysis/file-upload-validator.cjs');

test('valid FileReader base64 file is accepted with verified byte size', () => {
  const payload = Buffer.from('hello, Jarvis').toString('base64');
  const result = validateUploadedFileUrl('data:text/plain;base64,' + payload);
  assert.equal(result.valid, true);
  assert.equal(result.allowed, true);
  assert.equal(result.byte_size, Buffer.byteLength('hello, Jarvis'));
  assert.equal(result.content_type, 'text/plain');
  assert.equal(result.verified, 'data_url_encoding');
});

test('missing file, unsupported remote URL and other schemes are rejected', () => {
  for (const value of ['', null, undefined, {}, 'https://example.com/file.pdf',
    'file:///C:/sensitive.txt', 'javascript:alert(1)', 'data:,hello']) {
    const result = validateUploadedFileUrl(value);
    assert.equal(result.valid, false, String(value));
    assert.equal(result.allowed, false, String(value));
    assert.equal(result.file_url, null, String(value));
  }
});

test('invalid or noncanonical base64 cannot pass validation', () => {
  for (const value of ['data:image/png;base64,*','data:image/png;base64,A',
    'data:image/png;base64,AAAAA', 'data:image/png;base64,abcd===']) {
    assert.equal(validateUploadedFileUrl(value).valid, false, value);
  }
});

test('oversized FileReader payloads cannot be accepted', () => {
  const huge = 'data:application/octet-stream;base64,' + Buffer.alloc(MAX_FILE_BYTES + 1).toString('base64');
  const result = validateUploadedFileUrl(huge);
  assert.equal(result.valid,false);
  assert.equal(result.reason,'FILE_TOO_LARGE');
});

test('upload validation is enforced at the Electron IPC boundary', () => {
  const main = fs.readFileSync('electron/main.cjs','utf8');
  assert.match(main, /const \{ validateUploadedFileUrl \} = require\('\.\/analysis\/file-upload-validator\.cjs'\)/);
  assert.match(main, /case 'validateFileUpload':\s*return \{ data:validateUploadedFileUrl\(payload\?\.file_url \?\? payload\?\.url\) \}/);
  assert.doesNotMatch(main, /valid:Boolean\(fileUrl\)/);
});
