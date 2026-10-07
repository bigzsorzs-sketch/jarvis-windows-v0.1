import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';

const main = fs.readFileSync('electron/main.cjs', 'utf8');
function harness({ acquired = true, helper = null } = {}) {
  const events = [];
  const listeners = new Map();
  const start = main.indexOf('const isDev =');
  const end = main.indexOf('const manualRepairPlans =', start);
  const context = {
    path, os, process, parseHelperArgs:() => helper,
    fs:{ mkdirSync:() => events.push('helper-profile') },
    app:{ isPackaged:true, setPath:() => events.push('helper-user-data'),
      requestSingleInstanceLock:() => { events.push('lock'); return acquired; },
      quit:() => events.push('quit'), on:(event, callback) => listeners.set(event, callback) },
  };
  const api = vm.runInNewContext(main.slice(start, end) + ';({ setWindow:win => { mainWindow = win; }, isPrimary:() => typeof primaryInstance === "undefined" ? true : primaryInstance })', context);
  return { api, events, listeners, context };
}

test('a second main process exits before taking ownership of repair/profile state', () => {
  const h = harness({ acquired:false });
  assert.deepEqual(h.events, ['lock', 'quit']);
  assert.equal(h.api.isPrimary(), false);
  const start = main.indexOf('app.whenReady().then(async () => {') + 'app.whenReady().then(async () => {'.length;
  const end = main.indexOf('clearLegacyManualRuntimeState();', start);
  const ready = vm.runInNewContext('(async() => {' + main.slice(start, end) + ';return "initialized";})', {
    primaryInstance:h.api.isPrimary(), adminHelperConfig:null,
  });
  return ready().then(result => assert.equal(result, undefined));
});

test('opening Jarvis again restores and focuses the current window', () => {
  const h = harness();
  const calls = [];
  h.api.setWindow({ isDestroyed:() => false, isMinimized:() => true,
    restore:() => calls.push('restore'), show:() => calls.push('show'), focus:() => calls.push('focus') });
  assert.equal(typeof h.listeners.get('second-instance'), 'function');
  h.listeners.get('second-instance')();
  assert.deepEqual(calls, ['restore', 'show', 'focus']);
});

test('the elevated diagnostic helper keeps its independent profile without taking the main lock', () => {
  const h = harness({ acquired:false, helper:{ pipeName:'probe' } });
  assert.equal(h.api.isPrimary(), true);
  assert.deepEqual(h.events, ['helper-profile', 'helper-user-data']);
});
