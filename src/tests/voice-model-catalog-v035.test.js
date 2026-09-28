import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const settings = fs.readFileSync('src/pages/Beallitasok.jsx', 'utf8');
const preload = fs.readFileSync('electron/preload.cjs', 'utf8');
const main = fs.readFileSync('electron/main.cjs', 'utf8');

test('voice settings load the live OpenRouter speech model catalog', () => {
  assert.match(preload, /listSpeechModels/);
  assert.match(main, /models\?output_modalities=speech/);
  assert.match(main, /supported_voices/);
  assert.match(settings, /listSpeechModels/);
  assert.match(settings, /speechModels\.map/);
});

test('voice settings allow model, gender and exact voice selection independently', () => {
  assert.match(settings, /Hang neme/);
  assert.match(settings, /Konkrét hang/);
  assert.match(settings, /changeVoiceModel/);
  assert.match(settings, /changeVoiceGender/);
  assert.match(settings, /changeVoice/);
  assert.match(settings, /ttsVoice: desktopAi\.ttsVoice/);
});

test('Google voice catalog includes multiple known female and male choices', () => {
  assert.match(settings, /Kore:'female'/);
  assert.match(settings, /Zephyr:'female'/);
  assert.match(settings, /Charon:'male'/);
  assert.match(settings, /Puck:'male'/);
});

test('TTS fallback changes both model and voice safely', () => {
  assert.match(main, /defaultGenderVoice/);
  assert.match(main, /requestedIsGoogle/);
  assert.match(main, /\{ model:requestedModel, voice:requestedVoice \}/);
  assert.match(main, /\{ model:DEFAULT_TTS_MODEL, voice:fallbackVoice \}/);
});
