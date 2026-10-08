import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);

// Execute the real renderer modules, substituting only external boundaries
// (the LLM, storage, hardware and React hooks). No production code is copied.
export function moduleHarness({ stubs = {}, globals = {}, fallback } = {}) {
  const cache = new Map();
  function load(filename) {
    const fullPath = path.resolve(filename);
    if (cache.has(fullPath)) return cache.get(fullPath).exports;
    const module = { exports: {} };
    cache.set(fullPath, module);
    const source = fs.readFileSync(fullPath, 'utf8').replaceAll('import.meta.env?.DEV', 'false')
      .replaceAll('import.meta.url', JSON.stringify(pathToFileURL(fullPath).href));
    const { outputText } = ts.transpileModule(source, {
      fileName: fullPath,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    const localRequire = (name) => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(fullPath), name);
        const resolved = [base, base + '.js', base + '.jsx'].find(file => fs.existsSync(file) && fs.statSync(file).isFile());
        if (resolved) return load(resolved);
      }
      if (name === 'react/jsx-runtime') return require(name);
      if (fallback) return fallback(name);
      throw new Error(`Unmocked external boundary: ${name}`);
    };
    vm.runInNewContext(outputText, { module, exports: module.exports, require: localRequire,
      console, setTimeout, clearTimeout, URL, structuredClone, crypto: globalThis.crypto, ...globals }, { filename: fullPath });
    return module.exports;
  }
  return { load };
}
