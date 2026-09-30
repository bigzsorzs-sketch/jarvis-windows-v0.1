'use strict';
const fs = require('node:fs');
const path = require('node:path');

function snapshotRuntime(workspace, statePath, backup) {
  const saved = path.join(backup, '.previous-runtime');
  fs.mkdirSync(saved, { recursive:true });
  const dist = path.join(workspace, 'dist');
  const manifest = { hadDist:fs.existsSync(dist), hadState:fs.existsSync(statePath) };
  if (manifest.hadDist) fs.cpSync(dist, path.join(saved, 'dist'), { recursive:true });
  if (manifest.hadState) fs.copyFileSync(statePath, path.join(saved, 'runtime.json'));
  fs.writeFileSync(path.join(saved, 'manifest.json'), JSON.stringify(manifest));
  return saved;
}
function restoreRuntime(workspace, statePath, saved) {
  const manifest = JSON.parse(fs.readFileSync(path.join(saved, 'manifest.json'), 'utf8'));
  // Restore the compiled renderer before reactivating its state file.
  fs.rmSync(statePath, { force:true });
  const dist = path.join(workspace, 'dist');
  fs.rmSync(dist, { recursive:true, force:true });
  if (manifest.hadDist) fs.cpSync(path.join(saved, 'dist'), dist, { recursive:true });
  if (manifest.hadState) {
    const tmp = statePath + '.restore';
    fs.copyFileSync(path.join(saved, 'runtime.json'), tmp);
    fs.renameSync(tmp, statePath);
  }
}
module.exports = { snapshotRuntime, restoreRuntime };
