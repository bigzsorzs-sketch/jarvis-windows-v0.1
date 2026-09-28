'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'build', 'self-repair-toolchain');
const npmOut = path.join(out, 'npm');

function findGlobalNpm() {
  const candidates = [];
  try {
    const npmRoot = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], {
      encoding:'utf8',
      windowsHide:true
    }).trim();
    if (npmRoot) candidates.push(path.join(npmRoot, 'npm'));
  } catch {}
  candidates.push(
    path.join(path.dirname(process.execPath), 'node_modules', 'npm'),
    path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm')
  );
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'bin', 'npm-cli.js'))) || null;
}

const npmRoot = findGlobalNpm();
if (!npmRoot) throw new Error('SELF_REPAIR_NPM_NOT_FOUND');

fs.rmSync(out, { recursive:true, force:true });
fs.mkdirSync(out, { recursive:true });

const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
fs.copyFileSync(process.execPath, path.join(out, nodeName));
fs.cpSync(npmRoot, npmOut, { recursive:true });

const npmPackage = JSON.parse(fs.readFileSync(path.join(npmOut, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(out, 'toolchain.json'), JSON.stringify({
  node:process.version,
  npm:npmPackage.version,
  platform:process.platform,
  arch:process.arch,
  stagedAt:new Date().toISOString()
}, null, 2));

// Do not use package.json itself as an electron-builder extraResource source.
// electron-builder treats the application package specially; sourcing it again
// as an extraResource can leave app.asar without the package metadata required
// by Electron's package sanity check. Stage a byte-for-byte development copy
// under build/ and package that copy instead.
const sourcePackage = path.join(root, 'package.json');
const stagedDevelopmentPackage = path.join(root, 'build', 'self-development-package.json');
fs.copyFileSync(sourcePackage, stagedDevelopmentPackage);

console.log('Self-repair toolchain staged:', {
  node:process.version,
  npm:npmPackage.version,
  out
});
