import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';

const source = fs.readFileSync('src/pages/SystemCenter.jsx', 'utf8');
const start = source.indexOf('function RepairPatchPreview(');
const end = source.indexOf('\nfunction canonicalAppVersion(', start);
assert.ok(start >= 0 && end > start);
const code = transformSync(source.slice(start, end), { loader:'jsx', jsxFactory:'React.createElement' }).code;
const Preview = vm.runInNewContext(code + ';RepairPatchPreview', { React });
const tx = (hu, _en) => hu;

test('the approval UI renders exact original and replacement code without executing HTML', () => {
  const html = renderToStaticMarkup(React.createElement(Preview, { tx, patches:[{
    file:'src/example.jsx', replacements:[{ search:'const x = "<old>";', replace:'const x = "<script>new</script>";', all:false }],
  }] }));
  assert.match(html, /src\/example.jsx/);
  assert.match(html, /const x = &quot;&lt;old&gt;&quot;;/);
  assert.match(html, /const x = &quot;&lt;script&gt;new&lt;\/script&gt;&quot;;/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.match(html, /Egyetlen pontos előfordulás cseréje/);
  for (const scriptText of ['<SCRIPT>new</SCRIPT>', '<ScRiPt data-test="x">new</ScRiPt>']) {
    const markup = renderToStaticMarkup(React.createElement(Preview, { tx, patches:[{
      file:'src/example.jsx', content:scriptText,
    }] }));
    assert.doesNotMatch(markup, /<script\b/i);
    assert.ok(markup.includes('&lt;'));
  }
});

test('whole-file and all-occurrence proposals are visibly distinguished before approval', () => {
  const html = renderToStaticMarkup(React.createElement(Preview, { tx, patches:[
    { file:'src/new.js', content:'export const x = 2;\n' },
    { file:'src/other.js', replacements:[{ search:'old', replace:'new', all:true }] },
  ] }));
  assert.match(html, /A teljes fájl új tartalma/);
  assert.match(html, /export const x = 2;/);
  assert.match(html, /Minden előfordulás cseréje/);
});
