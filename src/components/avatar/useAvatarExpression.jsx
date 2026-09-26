export function getAvatarExpression(voiceState, lastError) {
  if (lastError) return 'error';
  const phase = String(voiceState?.phase || voiceState?.machineState || 'idle').toLowerCase();
  if (phase.includes('listen') || voiceState?.isListening || voiceState?.isRecognitionActive) return 'listening';
  if (phase.includes('process')) return 'thinking';
  if (phase.includes('speak') || voiceState?.isSpeaking) return 'speaking';
  return 'neutral';
}

export function getStatusLabel(expression) {
  return {
    neutral: 'Készen állok',
    listening: 'Figyelek...',
    thinking: 'Gondolkodom...',
    speaking: 'Beszélek...',
    error: 'Valami nem sikerült',
  }[expression] || 'Készen állok';
}

export function setMouthShape(face, shape = 'closed') {
  if (!face?.mouth) return;
  face.mouth.userData.shape = shape;
}

export function setExpression(face, expression = 'neutral') {
  if (!face) return;
  face.userData.expression = expression;
}

export function setSpeakingIntensity(face, level = 0) {
  if (!face) return;
  face.userData.speakingIntensity = Math.max(0, Math.min(1, level));
}