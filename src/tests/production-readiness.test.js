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

test('voice runtime selects recorded audio mode only when the configured desktop backend exists', () => {
  const runtime = read('src/lib/voiceRuntime.js');
  const mobile = read('src/lib/mobileVoiceIO.js');
  const preload = read('electron/preload.cjs');
  assert.equal(runtime.includes('canUseBrowserSpeechRuntime'), true);
  assert.equal(runtime.includes("if (canUseRecordedVoiceIO()) return 'recorded';"), true);
  assert.equal(mobile.includes("window.jarvisDesktop?.capabilities?.recordedStt === true"), true);
  assert.equal(preload.includes('recordedStt:true'), true);
  assert.equal(preload.includes('remoteTts:true'), true);
});

test('recorded voice endpoints are backed by OpenRouter STT and model TTS', () => {
  const main = read('electron/main.cjs');
  assert.equal(main.includes("case 'transcribeVoice'"), true);
  assert.equal(main.includes("case 'synthesizeVoice'"), true);
  assert.equal(main.includes('openrouter.ai/api/v1/audio/transcriptions'), true);
  assert.equal(main.includes('openrouter.ai/api/v1/audio/speech'), true);
  assert.equal(main.includes('openai/whisper-large-v3-turbo'), true);
  assert.equal(main.includes('google/gemini-3.8-flash-tts'), true);
  assert.equal(main.includes('RECORDED_STT_BACKEND_NOT_CONFIGURED'), false);
  assert.equal(main.includes('REMOTE_TTS_BACKEND_NOT_CONFIGURED'), false);
});

test('one-click updater requires stable exact-version release assets and SHA-256 verification', () => {
  const main = read('electron/main.cjs');
  assert.equal(main.includes("release.draft || release.prerelease"), true);
  assert.equal(main.includes("expectedInstallerName"), true);
  assert.equal(main.includes("UPDATE_CHECKSUM_MISMATCH"), true);
  assert.equal(main.includes("verification:nextSigned ? 'sha256+authenticode' : 'sha256'"), true);
  assert.equal(main.includes("if (currentSigned)"), true);
});
