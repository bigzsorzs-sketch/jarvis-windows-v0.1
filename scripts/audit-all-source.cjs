'use strict';

// Parse every committed JS/JSX/TS/TSX and JSON source file, including files
// outside the Vite import graph and outside the narrow ESLint file glob.
// A syntax audit is not a functional or security certification.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const ROOTS = ['src', 'electron', 'scripts', 'security', 'build', 'upgrade', 'public'];
const FILES = ['eslint.config.js', 'vite.config.js', 'tailwind.config.js',
  'postcss.config.js', 'jsconfig.json', 'tsconfig.json', 'package.json',
  'components.json', 'package-lock.json'];
const JS_EXTENSIONS = new Set(['.js', '.jsx', '.cjs', '.mjs', '.ts', '.tsx']);
const STRUCTURED_EXTENSIONS = new Set(['.json', '.webmanifest']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'release', 'coverage', 'self-repair-toolchain']);
const issues = [];
let visited = 0;
let parsed = 0;

function inspectFile(file) {
  const extension = path.extname(file).toLowerCase();
  if (!JS_EXTENSIONS.has(extension) && !STRUCTURED_EXTENSIONS.has(extension) && extension !== '.css') return;
  const relative = path.relative(ROOT, file).replace(/\\/g, '/');
  visited += 1;
  const source = fs.readFileSync(file, 'utf8');
  if (STRUCTURED_EXTENSIONS.has(extension)) {
    try {
      JSON.parse(source);
      parsed += 1;
    } catch (error) {
      issues.push(relative + ': JSON: ' + String(error?.message || error));
    }
    return;
  }
  const loader = extension === '.tsx' ? 'tsx'
    : extension === '.ts' ? 'ts'
    : extension === '.jsx' || extension === '.js' ? 'jsx'
    : extension === '.css' ? 'css'
    : 'js';
  try {
    esbuild.transformSync(source, {
      loader,
      sourcefile: relative,
      target: 'es2022',
      logLevel: 'silent',
    });
    parsed += 1;
  } catch (error) {
    const details = Array.isArray(error?.errors) ? error.errors : [];
    if (!details.length) issues.push(relative + ': ' + String(error?.message || error));
    for (const detail of details) {
      const location = detail.location;
      issues.push(relative + ':' + (location?.line || '?') + ':' + (location?.column || '?')
        + ' ' + String(detail.text || 'syntax error'));
    }
  }
}

function inspect(entry) {
  if (!fs.existsSync(entry)) return;
  const stat = fs.lstatSync(entry);
  if (stat.isSymbolicLink()) return; // Never follow links outside source root.
  if (stat.isDirectory()) {
    if (SKIP_DIRS.has(path.basename(entry))) return;
    for (const child of fs.readdirSync(entry).sort()) inspect(path.join(entry, child));
    return;
  }
  if (stat.isFile()) inspectFile(entry);
}

for (const entry of [...ROOTS, ...FILES]) inspect(path.join(ROOT, entry));
console.log('Jarvis source syntax audit: ' + parsed + '/' + visited + ' parsable source files.');
if (issues.length > 0) {
  for (const issue of issues) console.error('SOURCE_AUDIT_FAIL: ' + issue);
  process.exitCode = 1;
} else {
  console.log('Jarvis source syntax audit passed. This does not prove runtime correctness.');
}
