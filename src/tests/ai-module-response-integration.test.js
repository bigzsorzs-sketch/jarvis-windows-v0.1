import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as React from 'react';
import { moduleHarness } from './helpers/runtime-module.js';

const analysis = { score: 70, totalRevenue: 100, netProfit: 30, margin: 30, activeProjects: 1,
  overdueProjects: 0, unpaidTotal: 0, inefficiencies: [], recommendations: [], revenueByBiz: [] };
const widgets = [
  { name: 'QuickActions', path: 'src/pages/tools/QuickActions.jsx', states: { 0: { prompt: 'Summarize' }, 1: 'Demo' }, output: 2, loading: 3,
    match: props => props.onClick && props.children?.includes?.('Indítás') },
  { name: 'TranslateTool', path: 'src/pages/tools/TranslateTool.jsx', states: { 2: 'Demo' }, output: 3, loading: 4,
    match: props => props.onClick && props.children?.includes?.('Fordítás') },
  { name: 'Retail', path: 'src/pages/Retail.jsx', states: { 0: 'insights', 3: false }, output: 7, loading: 8,
    match: props => props.onGenerate },
  { name: 'EcosystemOptimizer', path: 'src/components/holding/EcosystemOptimizer.jsx', states: { 0: analysis, 1: false }, output: 2, loading: 3,
    match: props => props.onClick && props.children?.includes?.('AI Stratégiai tanács') },
];

function findProps(node, match) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) return node.map(child => findProps(child, match)).find(Boolean);
  return match(node.props || {}) ? node.props : findProps(node.props?.children, match);
}

function renderHarness(widget, invokeWithRetry) {
  const states = [], changes = [];
  let hook = 0;
  const placeholder = () => null;
  const moduleStub = new Proxy({ __esModule: true, default: placeholder, motion: { div: placeholder } },
    { get: (target, key) => key in target ? target[key] : placeholder });
  const childComponents = Object.fromEntries([...fs.readFileSync(widget.path, 'utf8').matchAll(/from ['"](@\/components\/[^'"]+)['"]/g)]
    .map(([, name]) => [name, moduleStub]));
  const h = moduleHarness({ stubs: {
    ...childComponents,
    react: { ...React, useState: initial => {
      const index = hook++;
      states[index] = Object.hasOwn(widget.states, index) ? widget.states[index] : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; changes.push({ index, value: states[index] }); }];
    }, useEffect: () => {} },
    '@/lib/llmGateway': { invokeWithRetry },
    '@/lib/i18n': { useLang: () => ({ t: key => key }) },
    '@/lib/ecosystemEngine': {},
    '@/api/jarvisClient': { jarvis: {} },
  }, fallback: name => {
    if (name.startsWith('@/components/') || ['lucide-react', 'react-router-dom', 'framer-motion'].includes(name)) return moduleStub;
    throw new Error('Unmocked module: ' + name);
  } });
  const tree = h.load(widget.path).default();
  const props = findProps(tree, widget.match);
  assert.ok(props, widget.name + ' exposes an AI action');
  return { states, changes, run: props.onGenerate || props.onClick };
}

for (const widget of widgets) {
  test(widget.name + ' renders the text from the real native LLM response shape', async () => {
    const h = renderHarness(widget, async () => ({ success: true,
      data: { result: 'Actual answer', model: 'provider/model', usage: { total_tokens: 20 }, cost: 0.001 } }));
    await h.run();
    assert.equal(h.states[widget.output], 'Actual answer');
    assert.equal(h.states[widget.loading], false);
  });
  test(widget.name + ' releases its busy state and displays a readable provider failure', async () => {
    const h = renderHarness(widget, async () => { throw new Error('Provider unavailable'); });
    await h.run();
    assert.equal(h.states[widget.loading], false);
    assert.equal(typeof h.states[widget.output], 'string');
    assert.ok(h.states[widget.output].length > 0);
  });
}
