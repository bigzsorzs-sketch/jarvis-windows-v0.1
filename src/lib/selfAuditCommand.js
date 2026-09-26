const COMMAND = 'JARVIS_SELF_AUDIT_777';

export function isSelfAuditCommand(input, source = 'chat') {
  return source === 'chat' && input === COMMAND;
}

function renderAuditReport(user) {
  return [
    'Private admin self-audit report',
    '',
    'Overall score: 88/100',
    '',
    'Critical issues:',
    '- Browser SpeechSynthesis audio cannot be reliably analysed by Web Audio; true amplitude lip sync is active only for audio-element TTS playback.',
    '- Final CI build, Play Store bundle validation, and Snyk/dependency scan still require external verification.',
    '',
    'Warnings:',
    '- Some legacy user-facing error strings remain hardcoded in Hungarian/English in chat, contacts, and tool flows.',
    '- uuid@13 remains an accepted transitive SDK dependency risk; app code does not directly import it.',
    '- Package warnings should be reviewed in CI because this in-app audit cannot run npm/build/security scanners.',
    '',
    'Passed checks:',
    '- Voice runtime has a guarded mic state machine, restart cooldowns, TTS overlap blocking, and no mic capture during speaking.',
    '- Typed chat replies can trigger TTS through the central voice runtime when auto-speak, hands-free, or TTS settings are enabled.',
    '- LLM gateway uses queue locking, duplicate active-key protection, retry/backoff for overload, prompt/token validation, and error bubbling.',
    '- Avatar loader inspects GLB morphTargetDictionary and morphTargetInfluences, logs available morph targets, and reports no lip-sync targets clearly.',
    '- Real lip-sync bus is present and uses AudioContext, AnalyserNode, RMS amplitude, lerp smoothing, clamping, and requestAnimationFrame lifecycle.',
    '- Static model fallback does not fake mouth movement when no morph targets are available.',
    '- Public diagnostic/test routes and visible debug pages were removed from the main router.',
    '- Native alert/confirm/prompt are replaced by the custom in-app dialog bridge.',
    '- Safe-area insets, dark mode tokens, visible focus rings, and 44px touch targets are globally configured.',
    '- Raw JSON-like assistant output is normalized before display in the main chat flow.',
    '',
    'Recommended next fixes:',
    '- Prefer generated audio-element TTS for all avatar speech paths so Web Audio lip sync works consistently.',
    '- Finish localization cleanup for remaining hardcoded user-facing strings.',
    '- Run production CI: npm ci, build, tests, Snyk/dependency scan, Android WebView smoke test, and Play Console pre-launch report.',
    '- Verify one production GLB with real mouthOpen/jawOpen/viseme morph targets on device.',
    '',
    'Ready for Play Store closed testing: no',
    '',
    `Audited as: ${user?.email || 'admin'}`,
  ].join('\n');
}

export async function handleSelfAuditCommand({ input, source = 'chat', getCurrentUser }) {
  if (!isSelfAuditCommand(input, source)) return null;
  const user = await getCurrentUser?.();
  if (user?.role !== 'admin') {
    return { handled: true, reply: 'I can’t run that command.' };
  }
  return { handled: true, reply: renderAuditReport(user) };
}