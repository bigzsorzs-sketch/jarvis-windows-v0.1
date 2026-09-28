import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSpeechThreshold,
  hasLiveAudioTrack,
  isLikelySilenceTranscript,
  microphoneErrorMessage,
  updateNoiseFloor,
} from '../lib/voiceInputHealth.js';

test('legitimate short voice commands are not discarded as hallucinations', () => {
  for (const text of ['hello', 'weather', 'computer', 'nézd meg', 'jó étvágyat kíván']) {
    assert.equal(isLikelySilenceTranscript(text), false, text);
  }
  assert.equal(isLikelySilenceTranscript('Feliratok az amara.org közösségétől'), true);
  assert.equal(isLikelySilenceTranscript('ecosdarae'), true);
});

test('VAD detects quiet speech without allowing speech to inflate the noise floor', () => {
  const threshold = computeSpeechThreshold(0.006);
  assert.ok(threshold < 0.015);
  assert.ok(threshold >= 0.008);
  assert.equal(updateNoiseFloor(0.006, 0.015), 0.006);
  assert.ok(updateNoiseFloor(0.006, 0.004) < 0.006);
});

test('live microphone track detection rejects ended or disabled streams', () => {
  const stream = (active, readyState, enabled=true) => ({
    active,
    getAudioTracks: () => [{ readyState, enabled }],
  });
  assert.equal(hasLiveAudioTrack(stream(true, 'live')), true);
  assert.equal(hasLiveAudioTrack(stream(true, 'ended')), false);
  assert.equal(hasLiveAudioTrack(stream(true, 'live', false)), false);
  assert.equal(hasLiveAudioTrack(stream(false, 'live')), false);
});

test('microphone errors preserve useful Windows-facing diagnostics', () => {
  assert.match(microphoneErrorMessage({ name:'NotAllowedError' }), /hozzáférése le van tiltva/);
  assert.match(microphoneErrorMessage({ name:'NotFoundError' }), /Nem találok használható mikrofont/);
  assert.match(microphoneErrorMessage({ name:'NotReadableError' }), /másik alkalmazás/);
});
