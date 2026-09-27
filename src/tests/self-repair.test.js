import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync('electron/main.cjs', 'utf8');
const preload = fs.readFileSync('electron/preload.cjs', 'utf8');
const systemCenter = fs.readFileSync('src/pages/SystemCenter.jsx', 'utf8');

test('self-repair is approval-gated and allowlisted', () => {
  assert.match(main, /function buildRepairPlan\(/);
  assert.match(main, /async function runApprovedRepair\(/);
  assert.match(main, /JARVIS_REPAIR_NOT_ALLOWLISTED/);
  assert.match(main, /localOwnerAuthorised\(\)/);
  assert.match(main, /jarvis:repair:apply/);
  assert.doesNotMatch(main, /case 'repair-arbitrary-code'/);
});

test('renderer can only request repair through isolated preload IPC', () => {
  assert.match(preload, /repair:\s*\{/);
  assert.match(preload, /jarvis:repair:plan/);
  assert.match(preload, /jarvis:repair:apply/);
  assert.match(systemCenter, /window\.confirm\(/);
  assert.match(systemCenter, /Javítás engedélyezése/);
});
