import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const voice = fs.readFileSync('src/lib/voiceRuntime.js','utf8');

test('hands-free final transcript keeps continuous recognition alive', () => {
  assert.match(voice,/r\.continuous = true/);
  assert.match(voice,/MIC_CONTINUOUS_SESSION/);
  assert.match(voice,/if \(!this\.state\.handsFree \|\| this\.singleCycleActiveRef\)/);
  const transcriptBlock = voice.slice(voice.indexOf("logger.debug(MODULE, 'Transcript received'"), voice.indexOf("r.onend ="));
  assert.match(transcriptBlock,/if \(!this\.state\.handsFree \|\| this\.singleCycleActiveRef\)[\s\S]*?_stopRecognition\(true\)/);
  assert.match(transcriptBlock,/else[\s\S]*?VOICE_PHASE\.LISTENING/);
});

test('hands-free recovery is fast while error backoff remains available', () => {
  assert.match(voice,/HANDS_FREE_RESTART_DELAY_MS = 180/);
  assert.match(voice,/MIN_RESTART_DELAY_MS = 750/);
  assert.match(voice,/_scheduleRestart\(this\.state\.handsFree \? HANDS_FREE_RESTART_DELAY_MS : MIN_RESTART_DELAY_MS, 'recognition_end'\)/);
  assert.match(voice,/_scheduleRestart\(HANDS_FREE_RESTART_DELAY_MS, 'tts_onend'\)/);
});
