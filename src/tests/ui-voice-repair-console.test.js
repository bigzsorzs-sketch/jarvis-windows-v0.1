import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const speech = fs.readFileSync('src/lib/speechPresentation.js','utf8');
const settings = fs.readFileSync('src/pages/Beallitasok.jsx','utf8');
const system = fs.readFileSync('src/pages/SystemCenter.jsx','utf8');
const voiceUi = fs.readFileSync('src/components/voice/GlobalVoiceControl.jsx','utf8');
const chat = fs.readFileSync('src/lib/chatOrchestrator.js','utf8');

test('theme supports light dark and system modes', () => {
  assert.match(settings,/ThemeToggleCard themeMode=\{themeMode\}/);
  assert.match(settings,/applyThemeMode/);
});

test('TTS has independent voice settings and sanitizes presentation text', () => {
  assert.match(settings,/Beszédhang/);
  assert.match(speech,/sanitizeForSpeech/);
  assert.match(speech,/Extended_Pictographic/);
  assert.match(speech,/chooseVoice/);
});

test('voice UI reflects recognition state instead of hands-free flag alone', () => {
  assert.match(voiceUi,/isRecognitionActive/);
  assert.match(voiceUi,/micLive \? \(/);
});

test('voice prompt knows voice conversation is active', () => {
  assert.match(chat,/Voice mode is ACTIVE in Jarvis/);
  assert.match(chat,/Never claim that voice conversation is unavailable or text-only/);
});

test('System Center accepts natural-language repair checks without bypassing sandbox', () => {
  assert.match(system,/Mit ellenőrizzek vagy javítsak\?/);
  assert.match(system,/Vizsgálat indítása/);
  assert.match(system,/nem írja át közvetlenül a Jarvist/);
});
