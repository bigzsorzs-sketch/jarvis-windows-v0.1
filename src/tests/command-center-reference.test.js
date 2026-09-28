import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('approved Jarvis reference layout remains the command center contract', () => {
  const app = read('App.jsx');
  const layout = read('components/Layout.jsx');
  const chat = read('pages/Chat.jsx');
  const stage = read('components/command-center/JarvisVoiceStage.jsx');
  const panel = read('components/command-center/CommandCenterChatPanel.jsx');
  const actions = read('components/command-center/CommandCenterActions.jsx');
  const css = read('styles/command-center.css');

  assert.match(app, /path="\/" element={<Chat \/>}/);
  assert.doesNotMatch(app, /import LiveAssistant/);
  assert.match(app, /path="\/live-assistant" element={<Chat \/>}/);

  assert.match(layout, /jarvis-reference-sidebar/);
  assert.match(layout, /jarvis-reference-logo-orb/);
  assert.match(layout, /sidebarCollapsed/);
  assert.doesNotMatch(layout, /label: 'Live Assistant'/);

  assert.match(chat, /JarvisVoiceStage/);
  assert.match(chat, /CommandCenterActions/);
  assert.match(chat, /CommandCenterChatPanel/);
  assert.match(stage, /\{conversation\}/);
  assert.match(panel, /Írj Jarvisnak/);
  assert.match(panel, /visibleMessages/);
  assert.doesNotMatch(actions, /Csevegés|Get answers|path: '\/chat'/);
  assert.doesNotMatch(layout, /path: '\/chat', label: t\('chat'\)/);

  assert.match(stage, /jarvis-hero-orb/);
  assert.match(stage, /jarvis-energy-field/);
  assert.match(stage, /jarvis-wave-console/);
  assert.match(stage, /jarvis-waveform/);
  assert.match(stage, /Figyelek/);
  assert.match(stage, /Gondolkodom/);
  assert.match(stage, /Beszélek/);

  assert.match(css, /\.jarvis-reference-sidebar/);
  assert.match(css, /\.jarvis-command-stage/);
  assert.match(css, /\.jarvis-hero-orb/);
  assert.match(css, /\.jarvis-command-actions/);
  assert.match(css, /\.jarvis-wave-console/);
});

test('global voice stays in the unified Jarvis command center', () => {
  const voice = read('components/voice/GlobalVoiceControl.jsx');
  assert.match(voice, /navigate\('\/'\)/);
  assert.doesNotMatch(voice, /navigate\('\/live-assistant'\)/);
});

test('CommandRouter remains the single assistant routing path', () => {
  const router = read('lib/CommandRouter.js');
  assert.match(router, /runAssistantTurn/);
  assert.match(router, /executeGlobalVoiceCommand/);
  assert.match(router, /findLocalUiCommand/);
  assert.match(router, /findWorkflowCommand/);
});


test('integrated conversation replaces the standalone chat navigation', () => {
  const layout = read('components/Layout.jsx');
  const actions = read('components/command-center/CommandCenterActions.jsx');
  const panel = read('components/command-center/CommandCenterChatPanel.jsx');
  assert.doesNotMatch(layout,/path: '\/chat'.*MessageCircle/);
  assert.doesNotMatch(actions,/Csevegés|Chat/);
  assert.match(panel,/onSend/);
  assert.match(panel,/jarvis-command-chat-log/);
});
