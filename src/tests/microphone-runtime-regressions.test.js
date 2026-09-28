import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const globalVoice = fs.readFileSync('src/components/voice/GlobalVoiceControl.jsx','utf8');
const chat = fs.readFileSync('src/pages/Chat.jsx','utf8');
const mobile = fs.readFileSync('src/lib/mobileVoiceIO.js','utf8');
const bridge = fs.readFileSync('src/hooks/useChatVoiceBridge.js','utf8');
const voiceRuntime = fs.readFileSync('src/lib/voiceRuntime.js','utf8');
const voiceHook = fs.readFileSync('src/hooks/useVoiceRuntime.js','utf8');
const chatInput = fs.readFileSync('src/components/chat/ChatInputBar.jsx','utf8');

test('turning the microphone off never asks for microphone permission first', () => {
  assert.match(globalVoice,/activationMode !== 'push-to-talk' && voice\.state\.handsFree[\s\S]*?setHandsFree\(false\)[\s\S]*?requestMicrophonePermission/);
  assert.match(chat,/activationMode !== 'push-to-talk' && voice\.state\.handsFree[\s\S]*?setHandsFree\(false\)[\s\S]*?requestMicrophonePermission/);
});

test('recorded microphone startup resets stale active state and validates a live audio track', () => {
  assert.match(mobile,/active && hasLiveAudioTrack\(stream\)/);
  assert.match(mobile,/if \(active\) \{[\s\S]*?active = false;[\s\S]*?closeAudioInputGraph/);
  assert.match(mobile,/MICROPHONE_STREAM_NOT_LIVE/);
  assert.match(mobile,/emitError\('microphone_denied', microphoneErrorMessage\(error\)\)/);
});

test('voice bridge always releases and resumes a hands-free microphone after command failures', () => {
  assert.match(bridge,/reason = 'send_failed'/);
  const completions = bridge.match(/completeVoiceCycle/g) || [];
  const resumes = bridge.match(/resumeListening/g) || [];
  assert.ok(completions.length >= 2);
  assert.ok(resumes.length >= 2);
});


test('voice overlay consumes transcripts without replaying them', () => {
  assert.match(globalVoice,/voice-command-overlay[\s\S]*?handledEventIdsRef\.current\.add\(event\.id\)[\s\S]*?return undefined/);
});

test('microphone failures stay visible as an error state', () => {
  const errors = mobile.match(/phase: 'error', isListening: false, isRecognitionActive: false/g) || [];
  assert.ok(errors.length >= 2);
});


test('push-to-talk can be cancelled while the microphone is live', () => {
  assert.match(voiceRuntime,/cancelVoiceCycle\(reason = 'cancelled'\)/);
  assert.match(voiceHook,/cancelVoiceCycle/);
  assert.match(globalVoice,/cancelVoiceCycle\?\.\('user_cancelled'\)/);
  assert.match(chat,/cancelVoiceCycle\?\.\('user_cancelled'\)/);
  assert.doesNotMatch(chatInput,/disabled=\{voiceBusy && !handsFree\}/);
});

test('stale STT results are invalidated after microphone cancellation or restart', () => {
  assert.match(mobile,/captureGeneration/);
  assert.match(mobile,/segmentGeneration !== captureGeneration/);
  assert.match(mobile,/captureGeneration \+= 1/);
});
