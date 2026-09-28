'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

if (process.platform !== 'win32') {
  console.log('Packaged Self-Repair toolchain test skipped outside Windows.');
  process.exit(0);
}

const resources = path.resolve(process.argv[2] || path.join('release','win-unpacked','resources'));
const root = path.join(resources, 'self-repair-toolchain');
const node = path.join(root, 'node.exe');
const npmCli = path.join(root, 'npm', 'bin', 'npm-cli.js');
const developmentRoot = path.join(resources, 'self-development-source');
const developmentLock = path.join(developmentRoot, 'package-lock.json');
const developmentPackage = path.join(developmentRoot, 'package.json');
const developmentWorkflow = path.join(developmentRoot, '.github', 'workflows', 'build-windows.yml');

if (!fs.existsSync(node)) throw new Error('PACKAGED_SELF_REPAIR_NODE_MISSING');
if (!fs.existsSync(npmCli)) throw new Error('PACKAGED_SELF_REPAIR_NPM_MISSING');
if (!fs.existsSync(developmentLock)) throw new Error('PACKAGED_SELF_REPAIR_LOCKFILE_MISSING');
if (!fs.existsSync(developmentPackage)) throw new Error('PACKAGED_SELF_REPAIR_PACKAGE_MISSING');
if (!fs.existsSync(developmentWorkflow)) throw new Error('PACKAGED_SELF_REPAIR_WORKFLOW_MISSING');
const workflowSource = fs.readFileSync(developmentWorkflow, 'utf8');
if (!workflowSource.includes('github/codeql-action/init@v3') || !workflowSource.includes('windows-installer:')) {
  throw new Error('PACKAGED_SELF_REPAIR_WORKFLOW_INVALID');
}
try {
  const pkg = JSON.parse(fs.readFileSync(developmentPackage, 'utf8'));
  if (!pkg?.version || !Array.isArray(pkg?.build?.files) || !Array.isArray(pkg?.build?.extraResources)) {
    throw new Error('PACKAGED_SELF_REPAIR_PACKAGE_INVALID');
  }
} catch (error) {
  if (error?.message === 'PACKAGED_SELF_REPAIR_PACKAGE_INVALID') throw error;
  throw new Error('PACKAGED_SELF_REPAIR_PACKAGE_INVALID');
}
try {
  const lock = JSON.parse(fs.readFileSync(developmentLock, 'utf8'));
  if (!lock?.lockfileVersion || !lock?.packages?.['']) {
    throw new Error('PACKAGED_SELF_REPAIR_LOCKFILE_INVALID');
  }
} catch (error) {
  if (error?.message === 'PACKAGED_SELF_REPAIR_LOCKFILE_INVALID') throw error;
  throw new Error('PACKAGED_SELF_REPAIR_LOCKFILE_INVALID');
}

const cleanPath = [
  root,
  path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')
].join(path.delimiter);
const env = { ...process.env, PATH:cleanPath, Path:cleanPath };

const nodeVersion = execFileSync(node, ['--version'], { encoding:'utf8', windowsHide:true, env }).trim();
const npmVersion = execFileSync(node, [npmCli, '--version'], { encoding:'utf8', windowsHide:true, env }).trim();

const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-toolchain-probe-'));
try {
  fs.writeFileSync(path.join(probe, 'package.json'), JSON.stringify({
    name:'jarvis-toolchain-probe',
    version:'1.0.0',
    private:true,
    scripts:{ probe:'node -e "process.stdout.write(\\\"BUNDLED_NODE_OK\\\")"' }
  }, null, 2));
  const output = execFileSync(node, [npmCli, '--prefix', probe, 'run', 'probe'], {
    encoding:'utf8',
    windowsHide:true,
    env
  });
  if (!String(output).includes('BUNDLED_NODE_OK')) {
    throw new Error('PACKAGED_SELF_REPAIR_NPM_SCRIPT_DID_NOT_USE_BUNDLED_NODE');
  }
  console.log('Packaged Self-Repair toolchain OK:', { nodeVersion, npmVersion });
} finally {
  fs.rmSync(probe, { recursive:true, force:true });
}
