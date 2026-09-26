import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const checks = [];

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

function assertCheck(name, condition, details = '') {
  checks.push({ name, ok: Boolean(condition), details });
}

const imageEditor = read('src/pages/tools/ImageEditor.jsx');
assertCheck('Image editor has no invalid onColorpicked React prop', !imageEditor.includes('onColorpicked='));
assertCheck('Image editor listens for colorpicked via DOM event', imageEditor.includes("addEventListener('colorpicked'"));

const voiceRuntime = read('src/lib/voiceRuntime.js');
assertCheck('Voice runtime detects Android WebView', voiceRuntime.includes('isAndroidMobileWebView'));
assertCheck('Voice runtime gates SpeechRecognition support', voiceRuntime.includes('isSpeechInputSupported') && voiceRuntime.includes('canUseBrowserSpeechRuntime'));
assertCheck('Voice runtime supports recorded continuous mobile voice mode', voiceRuntime.includes("voiceInputMode === 'recorded'") && voiceRuntime.includes('startContinuous') && voiceRuntime.includes('resumeListening'));
assertCheck('Voice runtime gates speechSynthesis support', voiceRuntime.includes('isTtsSupported') && voiceRuntime.includes('canUseBrowserTTS'));
assertCheck('Voice runtime has hard TTS timeout', voiceRuntime.includes('20000') && voiceRuntime.includes('ttsTimeoutRef'));
assertCheck('Voice runtime prevents mic restart during speaking/processing', voiceRuntime.includes('VOICE_PHASE.SPEAKING') && voiceRuntime.includes('VOICE_PHASE.PROCESSING') && voiceRuntime.includes('MIC_RESTART_BLOCKED'));
assertCheck('Voice runtime pauses audio capture in background', voiceRuntime.includes("document.addEventListener('visibilitychange'") && voiceRuntime.includes('app-backgrounded'));

const mobileVoiceIO = read('src/lib/mobileVoiceIO.js');
assertCheck('Mobile voice keeps continuous mode controls', mobileVoiceIO.includes('startContinuous') && mobileVoiceIO.includes('stopContinuous') && mobileVoiceIO.includes('resumeCapture'));
assertCheck('Mobile voice uses MediaRecorder instead of SpeechRecognition', mobileVoiceIO.includes('MediaRecorder') && !mobileVoiceIO.includes('SpeechRecognition'));
assertCheck('Mobile voice uses backend transcription', mobileVoiceIO.includes("jarvis.functions.invoke('transcribeVoice'"));
assertCheck('Mobile voice uses backend synthesis', mobileVoiceIO.includes("jarvis.functions.invoke('synthesizeVoice'"));

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? '✓' : '✗'} ${check.name}${check.details ? ` — ${check.details}` : ''}`);
}

if (failed.length > 0) {
  console.error(`\nProduction readiness checks failed: ${failed.length}`);
  process.exit(1);
}

console.log('\nProduction readiness checks passed.');