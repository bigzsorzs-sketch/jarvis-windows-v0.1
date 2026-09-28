import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('native dialog bridge does not break synchronous confirmations', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/common/NativeDialogBridge.jsx'), 'utf8');
  assert.equal(source.includes('window.confirm ='), false, 'window.confirm must remain native/synchronous');
  assert.equal(source.includes('window.prompt ='), false, 'window.prompt must remain native/synchronous');
  assert.equal(source.includes('window.alert ='), true, 'custom alert bridge should remain available');
});

test('elevated diagnostics allows enough time for Windows UAC and helper startup', () => {
  const source = fs.readFileSync(path.join(root, 'electron/admin-diagnostics.cjs'), 'utf8');
  assert.match(source, /UAC_CONNECT_TIMEOUT_MS\s*=\s*90\s*\*\s*1000/);
  assert.match(source, /Date\.now\(\)\s*\+\s*UAC_CONNECT_TIMEOUT_MS/);
  assert.match(source, /timeout:UAC_CONNECT_TIMEOUT_MS/);
});
