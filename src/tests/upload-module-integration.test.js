import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as React from 'react';
import { moduleHarness } from './helpers/runtime-module.js';

const require = createRequire(import.meta.url);
const { validateUploadedFileUrl } = require('../../electron/analysis/file-upload-validator.cjs');
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=', 'base64');
const blob = new Blob([bytes], { type: 'image/png' });
const file = new File([blob], 'demo.png', { type: 'image/png' });
const fileUrl = 'data:image/png;base64,' + bytes.toString('base64');
class FileReader {
  async readAsDataURL(input) {
    try { this.result = `data:${input.type};base64,${Buffer.from(await input.arrayBuffer()).toString('base64')}`; this.onload(); }
    catch (error) { this.error = error; this.onerror(); }
  }
}
const canvas = () => ({ width: 1, height: 1, toBlob: fn => fn(blob), getContext: () => ({ drawImage() {} }) });

function findProps(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) return node.map(child => findProps(child, predicate)).find(Boolean);
  return predicate(node.props || {}) ? node.props : findProps(node.props?.children, predicate);
}

function uploadHarness(path, overrides = {}, { rejectUpload = false } = {}) {
  const states = [], requests = [], results = [], errors = [], changes = [];
  let hook = 0, queued;
  const noop = () => null;
  const ui = new Proxy({ __esModule: true, default: noop, motion: { div: noop } }, { get: (target, key) => key in target ? target[key] : noop });
  const uiStubs = Object.fromEntries([...fs.readFileSync(path, 'utf8').matchAll(/from ['"](@\/components\/[^'"]+)['"]/g)]
    .map(([, name]) => [name, ui]));
  const h = moduleHarness({ stubs: {
    ...uiStubs,
    react: { ...React, useEffect() {}, useMemo: fn => fn(), useRef: value => ({ current: value }), useState: initial => {
      const index = hook++; states[index] = Object.hasOwn(overrides, index) ? overrides[index] : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    } },
    '@/components/image-editor/ImageOperationQueue': { imageOpQueue: { enqueue: fn => { queued = fn(); return queued; } } },
    '@/lib/i18n': { useLang: () => ({ t: key => key, lang: 'hu' }) },
    '@/lib/llmGateway': { invokeWithRetry: async () => ({ data: { result: 'Continue the original style.' } }) },
    '@/lib/logger': { logger: { warn() {}, error() {} } },
  }, globals: { File, Blob, FileReader, FormData, console: { ...console, error() {} }, document: { createElement: () => canvas() },
    window: { jarvisDesktop: { invokeFunction: async (name, payload) => {
      requests.push({ name, payload });
      if (name === 'validateFileUpload') return { data: rejectUpload ? { valid: false, allowed: false, reason: 'FILE_DENIED' } : validateUploadedFileUrl(payload.file_url) };
      if (name === 'llmProxy') return { data: { result: 'Use the reference style.' } };
      if (name === 'runAiTask') return { data: { result: '{"description":"Demo receipt","amount":12,"date":"2026-10-08"}' } };
      if (name === 'generateImage') return { data: { url: fileUrl } };
      throw new Error('Unexpected native call: ' + name);
    } } } }, fallback: name => {
    if (['lucide-react', 'framer-motion'].includes(name)) return ui;
    if (name === 'react-router-dom') return { useNavigate: () => noop };
    throw new Error('Unexpected dependency: ' + name);
  } });
  const render = props => h.load(path).default({ layers: [{ visible: true, canvas: canvas() }], activeLayer: 0, CANVAS_W: 1, CANVAS_H: 1,
    maskRect: { x: 0, y: 0, w: 10, h: 10 }, onEnhanceComplete: result => results.push(result), onMaskResult: result => results.push(result),
    onOutpaintComplete: result => results.push(result), onStyleResult: result => results.push(result),
    onChange: result => changes.push(result), onError: error => errors.push(error), ...props });
  return { h, render, requests, results, errors, changes, states, get queued() { return queued; } };
}

const panels = [
  ['AIEnhancePanel', {}, '✨ Kép javítása'],
  ['AIMaskPanel', { 0: 'Replace with a blue sky' }, 'AI alkalmazása'],
  ['OutpaintPanel', {}, 'Kiterjesztés'],
  ['StyleTransferPanel', { 1: { file, url: fileUrl }, 2: 'canvas' }, 'Stílus alkalmazása'],
];
for (const [name, states, label] of panels) {
  test(name + ' carries a canvas file through the real upload adapter and native validator before generation', async () => {
    const h = uploadHarness('src/components/image-editor/' + name + '.jsx', states);
    const tree = h.render();
    const action = findProps(tree, props => props.onClick && props.children?.includes?.(label));
    assert.ok(action, name + ' action found');
    await action.onClick(); await h.queued;
    const uploads = h.requests.filter(request => request.name === 'validateFileUpload');
    assert.equal(uploads.length, name === 'StyleTransferPanel' ? 2 : 1);
    assert.ok(uploads.every(request => request.payload.file_url === fileUrl));
    assert.equal(h.requests.filter(request => request.name === 'generateImage').length, 1);
    assert.equal(h.results.length, 1);
  });
}

test('MultiImageUpload accepts the native valid/allowed receipt instead of looking for a nonexistent success field', async () => {
  const h = uploadHarness('src/components/common/MultiImageUpload.jsx');
  const props = findProps(h.render(), props => props.type === 'file');
  await props.onChange({ target: { files: [file], value: 'selected' } });
  assert.equal(h.requests[0].payload.file_url, fileUrl);
  assert.equal(h.changes[0][0]?.url, fileUrl);
  assert.equal(h.changes[0][0]?.name, 'demo.png');
  assert.equal(h.errors.length, 0);
  assert.equal(h.states[0], false);
});

test('a native upload refusal prevents image generation', async () => {
  const h = uploadHarness('src/components/image-editor/AIEnhancePanel.jsx', {}, { rejectUpload: true });
  const props = findProps(h.render(), props => props.onClick && props.children?.includes?.('✨ Kép javítása'));
  await props.onClick(); await h.queued;
  assert.equal(h.requests.filter(request => request.name === 'generateImage').length, 0);
  assert.equal(h.results.length, 0);
  assert.equal(h.states[0], false);
});

test('style transfer can run on its default layer target without requiring a mask', async () => {
  const h = uploadHarness('src/components/image-editor/StyleTransferPanel.jsx', {0:{prompt:'Watercolor'}});
  const props = findProps(h.render(), props => props.onClick && props.children?.includes?.('Stílus alkalmazása'));
  assert.equal(props.disabled,false);
  await props.onClick();
  assert.equal(h.results.length,1);
});

test('style transfer does not generate an image when there are no visible source layers', async () => {
  const h = uploadHarness('src/components/image-editor/StyleTransferPanel.jsx', {0:{prompt:'Watercolor'}});
  const props = findProps(h.render({layers:[]}), props => props.onClick && props.children?.includes?.('Stílus alkalmazása'));
  assert.equal(props.disabled,true);
  await props.onClick();
  assert.equal(h.requests.length,0);
});

test('the finance receipt scan sends a validated file URL to analysis and populates its draft', async () => {
  const h = uploadHarness('src/pages/tools/FinanceTool.jsx', { 8: false });
  const props = findProps(h.render(), props => props.type === 'file');
  assert.ok(props, 'receipt scan input found');
  await props.onChange({ target: { files: [file] } });
  assert.equal(h.requests[0].payload.file_url, fileUrl);
  assert.equal(h.requests[1]?.name, 'runAiTask');
  assert.equal(h.requests[1].payload.file_urls[0], fileUrl);
  assert.equal(h.states[4].description, 'Demo receipt');
  assert.equal(h.states[4].amount, 12);
  assert.equal(h.states[3], true);
  assert.equal(h.states[7], false);
});

test('uploadCanvasAsFile uses the same validated adapter as the screens', async () => {
  const h = uploadHarness('src/lib/canvasOptimization.js');
  const result = await h.h.load('src/lib/canvasOptimization.js').uploadCanvasAsFile(canvas());
  assert.equal(result.file_url, fileUrl);
  assert.equal(h.requests[0].payload.file_url, fileUrl);
});
