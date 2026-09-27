import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

test('image editor does not pass an invalid React onColorpicked prop', () => {
  const source = read('src/pages/tools/ImageEditor.jsx');
  assert.equal(source.includes('onColorpicked='), false);
  assert.equal(source.includes("addEventListener('colorpicked'"), true);
});

test('voice runtime only selects recorded audio mode when a real backend capability exists', () => {
  const runtime = read('src/lib/voiceRuntime.js');
  const mobile = read('src/lib/mobileVoiceIO.js');
  const preload = read('electron/preload.cjs');
  assert.equal(runtime.includes('canUseBrowserSpeechRuntime'), true);
  assert.equal(runtime.includes("if (canUseRecordedVoiceIO()) return 'recorded';"), true);
  assert.equal(mobile.includes("window.jarvisDesktop?.capabilities?.recordedStt === true"), true);
  assert.equal(preload.includes('recordedStt:false'), true);
});

test('unconfigured recorded voice endpoints return explicit capability results instead of NOT_IMPLEMENTED', () => {
  const main = read('electron/main.cjs');
  assert.equal(main.includes("case 'transcribeVoice'"), true);
  assert.equal(main.includes("case 'synthesizeVoice'"), true);
  assert.equal(main.includes('RECORDED_STT_BACKEND_NOT_CONFIGURED'), true);
  assert.equal(main.includes('REMOTE_TTS_BACKEND_NOT_CONFIGURED'), true);
});