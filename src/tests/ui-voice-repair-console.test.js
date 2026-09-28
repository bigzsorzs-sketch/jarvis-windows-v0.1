import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const speech = fs.readFileSync('src/lib/speechPresentation.js','utf8');
const settings = fs.readFileSync('src/pages/Beallitasok.jsx','utf8');
const system = fs.readFileSync('src/pages/SystemCenter.jsx','utf8');
const voiceUi = fs.readFileSync('src/components/voice/GlobalVoiceControl.jsx','utf8');
const chat = fs.readFileSync('src/lib/chatOrchestrator.js','utf8');
const chatPage = fs.readFileSync('src/pages/Chat.jsx','utf8');
const voiceRuntime = fs.readFileSync('src/lib/voiceRuntime.js','utf8');
const recordedVoice = fs.readFileSync('src/lib/mobileVoiceIO.js','utf8');
const preload = fs.readFileSync('electron/preload.cjs','utf8');
const electronMain = fs.readFileSync('electron/main.cjs','utf8');
const voiceStage = fs.readFileSync('src/components/command-center/JarvisVoiceStage.jsx','utf8');
const layout = fs.readFileSync('src/components/Layout.jsx','utf8');

test('theme supports light dark and system modes', () => {
  assert.match(settings,/ThemeToggleCard themeMode=\{themeMode\}/);
  assert.match(settings,/applyThemeMode/);
});

test('speech presentation still sanitizes text while desktop replies use model voice', () => {
  assert.match(settings,/Beszédhang/);
  assert.match(settings,/Windows rendszerhang nincs használva/);
  assert.match(settings,/gemini-3\.8-flash-tts/);
  assert.match(speech,/sanitizeForSpeech/);
  assert.match(speech,/Extended_Pictographic/);
});

test('desktop voice bridge enables recorded STT and remote TTS', () => {
  assert.match(preload,/recordedStt:true/);
  assert.match(preload,/remoteTts:true/);
  assert.match(electronMain,/openrouter\.ai\/api\/v1\/audio\/transcriptions/);
  assert.match(electronMain,/openrouter\.ai\/api\/v1\/audio\/speech/);
  assert.match(electronMain,/openai\/whisper-large-v3-turbo/);
  assert.match(electronMain,/google\/gemini-3\.8-flash-tts/);
  assert.match(voiceRuntime,/if \(canUseRecordedVoiceIO\(\)\) return 'recorded'/);
});

test('model TTS never falls through to Windows speech and does not truncate at 420 characters', () => {
  assert.doesNotMatch(recordedVoice,/speakBrowserTTS/);
  assert.doesNotMatch(recordedVoice,/FAST_BROWSER_TTS_MAX_LENGTH/);
  assert.doesNotMatch(chatPage,/substring\(0, 420\)/);
  assert.match(recordedVoice,/TTS_SEGMENT_MAX_CHARS = 1400/);
});

test('recorded microphone waits for end-of-speech instead of cutting every 1.8 seconds', () => {
  assert.match(recordedVoice,/END_OF_SPEECH_SILENCE_MS = 900/);
  assert.match(recordedVoice,/MAX_UTTERANCE_MS = 15000/);
  assert.match(recordedVoice,/currentRms/);
  assert.match(recordedVoice,/speechDetected/);
  assert.doesNotMatch(recordedVoice,/SEGMENT_MS = 1800/);
});

test('Jarvis orb reflects working and speaking phases and home has one mic control', () => {
  assert.match(voiceStage,/busy = false/);
  assert.match(voiceStage,/is-working/);
  assert.match(voiceStage,/is-speaking/);
  assert.match(chatPage,/actions=\{<CommandCenterActions/);
  assert.match(layout,/location\.pathname !== '\/' && <GlobalVoiceControl/);
});

test('voice UI reflects recognition state instead of hands-free flag alone', () => {
  assert.match(voiceUi,/isRecognitionActive/);
  assert.match(voiceUi,/micLive \? \(/);
});

test('voice prompt knows voice conversation is active', () => {
  assert.match(chat,/Voice mode is ACTIVE in Jarvis/);
  assert.match(chat,/Never claim that voice conversation is unavailable or text-only/);
});

test('System Center provides source-aware conversation and owner-gated Autopilot', () => {
  assert.match(system,/Self-Repair párbeszéd/);
  assert.match(system,/Program feltérképezése/);
  assert.match(system,/Hibák keresése/);
  assert.match(system,/Autopilot önfejlesztés/);
  assert.match(system,/sandbox \+ teljes teszt \+ automatikus rollback/);
  assert.match(system,/Release engedélyezése/);
});
