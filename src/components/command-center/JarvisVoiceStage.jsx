import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Square } from 'lucide-react';
import { requestMicrophonePermission } from '@/lib/microphonePermission';
import { useLang } from '@/lib/i18n';

export default function JarvisVoiceStage({
  voice,
  busy = false,
  busyLabel = '',
  actions = null,
  conversation = null,
  title = null,
  subtitle = null
}) {
  const { lang } = useLang();
  const hu = lang === 'hu';
  const displayTitle = title || (hu ? 'Szia, Jarvis vagyok.' : "Hi, I'm Jarvis.");
  const displaySubtitle = subtitle || (hu
    ? 'Gondolkodom, tervezek, alkotok és veled együtt végrehajtok.'
    : 'I can think, plan, create, and take action with you.');
  const [micError, setMicError] = useState('');
  const runtimePhase = voice?.state?.phase || 'idle';
  const phase = busy && runtimePhase !== 'speaking' ? 'processing' : runtimePhase;
  const active = ['listening', 'processing', 'speaking'].includes(phase);
  const listening = phase === 'listening';
  const working = phase === 'processing';
  const speaking = phase === 'speaking';

  const status = micError
    || (speaking
      ? 'Beszélek…'
      : working
        ? (busyLabel || 'Gondolkodom…')
        : listening
          ? 'Figyelek…'
          : voice?.state?.activationMode === 'wake-word'
            ? (hu ? `Mondd: „${voice?.state?.wakeWord || 'Jarvis'} …”` : `Say: “${voice?.state?.wakeWord || 'Jarvis'} …”`)
            : (hu ? 'Beszélj természetesen… figyelek.' : 'Speak naturally… I’m listening.'));

  const orbPhaseClass = speaking
    ? ' is-speaking'
    : working
      ? ' is-working'
      : listening
        ? ' is-listening'
        : '';

  const orbScale = speaking
    ? [1, 1.085, 1.012, 1.115, 1]
    : working
      ? [1, 1.065, 1.01, 1.1, 1]
      : listening
        ? [1, 1.028, 1]
        : [1, 1.012, 1];

  const orbDuration = speaking ? 0.82 : working ? 1.05 : listening ? 2.1 : 5.2;

  const toggleMicrophone = async () => {
    setMicError('');
    const permission = await requestMicrophonePermission();
    if (!permission.ok) {
      setMicError(permission.message);
      return;
    }

    if (voice?.state?.activationMode === 'push-to-talk') {
      voice?.startSingleCycle?.();
      return;
    }

    voice?.setHandsFree?.(!voice?.state?.handsFree);
  };

  return (
    <section className="jarvis-command-stage" aria-label="Jarvis voice command center" data-voice-phase={phase}>
      <div className="jarvis-orb-scene" aria-hidden="true">
        <div className={active ? 'jarvis-energy-field is-active' : 'jarvis-energy-field'}>
          <svg viewBox="0 0 1200 220" preserveAspectRatio="none">
            <path className="energy-wave wave-one" d="M0 112 C90 35 150 35 240 112 S390 189 480 112 S630 35 720 112 S870 189 960 112 S1110 35 1200 112" />
            <path className="energy-wave wave-two" d="M0 112 C90 178 150 178 240 112 S390 46 480 112 S630 178 720 112 S870 46 960 112 S1110 178 1200 112" />
            <path className="energy-wave wave-three" d="M0 112 C110 72 170 72 260 112 S410 152 500 112 S650 72 740 112 S890 152 980 112 S1120 72 1200 112" />
            <path className="energy-wave wave-four" d="M0 112 C75 88 125 61 205 112 S340 160 420 112 S555 64 635 112 S770 158 850 112 S1000 68 1200 112" />
            <path className="energy-wave wave-five" d="M0 112 C100 132 160 151 245 112 S385 73 470 112 S610 151 695 112 S835 73 920 112 S1080 139 1200 112" />
            <path className="energy-wave wave-six" d="M0 112 C120 101 165 87 255 112 S405 137 495 112 S645 87 735 112 S885 137 975 112 S1120 98 1200 112" />
          </svg>
        </div>

        <motion.div
          className={`jarvis-hero-orb${active ? ' is-active' : ''}${orbPhaseClass}`}
          animate={{ scale: orbScale }}
          transition={{ duration: orbDuration, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span className="jarvis-orb-core" />
          <span className="jarvis-orb-ring jarvis-orb-ring-one" />
          <span className="jarvis-orb-ring jarvis-orb-ring-two" />
        </motion.div>
      </div>

      <div className="jarvis-command-copy">
        <h2>{displayTitle}</h2>
        <p>{displaySubtitle}</p>
      </div>

      {actions}

      <div className={active ? 'jarvis-wave-console is-active' : 'jarvis-wave-console'}>
        <button
          type="button"
          className={(voice?.state?.handsFree || listening) ? 'jarvis-wave-mic enabled' : 'jarvis-wave-mic'}
          onClick={toggleMicrophone}
          aria-label={voice?.state?.activationMode === 'push-to-talk' ? 'Beszéd indítása' : voice?.state?.handsFree ? 'Mikrofon kikapcsolása' : 'Mikrofon bekapcsolása'}
        >
          {(voice?.state?.handsFree || listening) ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
        <div className={active ? 'jarvis-waveform is-active' : 'jarvis-waveform'} aria-hidden="true">
          <svg viewBox="0 0 760 52" preserveAspectRatio="none">
            <polyline className="voice-wave voice-wave-soft" points="0,26 210,26 245,25 270,27 292,24 312,29 330,21 342,31 354,16 366,36 378,11 390,41 402,17 414,35 426,21 440,31 456,23 474,29 498,25 530,26 760,26" />
            <polyline className="voice-wave voice-wave-main" points="0,26 235,26 270,25 294,27 314,23 330,30 344,18 356,34 368,11 380,41 392,7 404,45 416,14 428,38 440,20 454,32 470,22 488,30 510,25 545,26 760,26" />
          </svg>
        </div>
        <button type="button" className="jarvis-wave-stop" onClick={() => voice?.setHandsFree?.(false)} aria-label="Hangvezérlés leállítása">
          <Square size={15} />
        </button>
        <div className={micError ? 'jarvis-wave-status is-error' : 'jarvis-wave-status'}>{status}</div>
      </div>

      {conversation}
    </section>
  );
}
