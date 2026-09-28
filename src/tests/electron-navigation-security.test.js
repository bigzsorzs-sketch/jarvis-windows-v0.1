import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync('electron/main.cjs','utf8');

test('privileged Jarvis renderer cannot navigate to remote content', () => {
  assert.match(main,/contextIsolation:true/);
  assert.match(main,/nodeIntegration:false/);
  assert.match(main,/sandbox:true/);
  assert.match(main,/webSecurity:true/);
  assert.match(main,/function isTrustedRendererNavigation/);
  assert.match(main,/webContents\.on\('will-navigate'/);
  assert.match(main,/setWindowOpenHandler/);
  assert.match(main,/return \{ action:'deny' \}/);
  assert.match(main,/lockRendererNavigation\(mainWindow\)/);
});

test('packaged renderer trust is restricted to its own dist index file', () => {
  assert.match(main,/parsed\.protocol !== 'file:'/);
  assert.match(main,/fileURLToPath\(parsed\)/);
  assert.match(main,/dist','index\.html'/);
});
