import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const stage = fs.readFileSync('src/components/command-center/JarvisVoiceStage.jsx','utf8');
const layout = fs.readFileSync('src/components/Layout.jsx','utf8');
const css = fs.readFileSync('src/styles/command-center.css','utf8');

test('approved 9404 home keeps continuous reference waveform', () => {
  assert.match(stage, /voice-wave-main/);
  assert.match(stage, /voice-wave-soft/);
  assert.doesNotMatch(stage, /const BARS/);
  assert.match(css, /jarvis-voice-wave/);
});

test('approved 9404 home hides secondary system navigation without deleting it', () => {
  assert.match(layout, /location\.pathname !== '\/'/);
  assert.match(layout, /Automotive/);
  assert.match(layout, /System Center/);
  assert.match(layout, /Settings/);
});

test('approved 9404 precision orb styling remains present', () => {
  assert.match(css, /9404\.jpg precision pass/);
  assert.match(css, /width:136px;height:136px/);
  assert.match(css, /0 0 128px/);
});
