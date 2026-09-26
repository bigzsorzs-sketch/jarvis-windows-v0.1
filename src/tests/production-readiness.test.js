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

test('voice runtime uses recorded continuous audio path for Android/WebView', () => {
  const source = read('src/lib/voiceRuntime.js');
  assert.equal(source.includes('isAndroidMobileWebView'), true);
  assert.equal(source.includes('canUseBrowserSpeechRuntime'), true);
  assert.equal(source.includes("voiceInputMode === 'recorded'"), true);
  assert.equal(source.includes('startContinuous'), true);
  assert.equal(source.includes('resumeListening'), true);
});

test('mobile voice IO uses continuous MediaRecorder with backend STT and TTS', () => {
  const source = read('src/lib/mobileVoiceIO.js');
  assert.equal(source.includes('startContinuous'), true);
  assert.equal(source.includes('stopContinuous'), true);
  assert.equal(source.includes('resumeCapture'), true);
  assert.equal(source.includes('MediaRecorder'), true);
  assert.equal(source.includes('SpeechRecognition'), false);
  assert.equal(source.includes("jarvis.functions.invoke('transcribeVoice'"), true);
  assert.equal(source.includes("jarvis.functions.invoke('synthesizeVoice'"), true);
});