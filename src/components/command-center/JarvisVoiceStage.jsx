import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Square } from 'lucide-react';
import { requestMicrophonePermission } from '@/lib/microphonePermission';

export default function JarvisVoiceStage({
  voice,
  busy = false,
  busyLabel = '',
  actions = null,
  title = "Hi, I'm Jarvis.",
  subtitle = 'I can think, plan, create, and take action with you.'
}) {
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
          : 'Speak naturally… I’m listening.');

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
    if (voice?.state?.handsFree) {
      voice?.setHandsFree?.(false);
      return;
    }

    const permission = await requestMicrophonePermission();
    if (!permission.ok) {
      setMicError(permission.message);
      return;
    }
    voice?.setHandsFree?.(true);
  };

  return (
    <section className="jarvis-command-stage" aria-label="Jarvis voice command center" data-voice-phase={phase}>
      <div className={active ? 'jarvis-energy-field is-active' : 'jarvis-energy-field'} aria-hidden="true">
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
        aria-hidden="true"
      >
        <span className="jarvis-orb-core" />
        <span className="jarvis-orb-ring jarvis-orb-ring-one" />
        <span className="jarvis-orb-ring jarvis-orb-ring-two" />
      </motion.div>

      <div className="jarvis-command-copy">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>

      {actions}

      <div className={active ? 'jarvis-wave-console is-active' : 'jarvis-wave-console'}>
        <button
          type="button"
          className={voice?.state?.handsFree ? 'jarvis-wave-mic enabled' : 'jarvis-wave-mic'}
          onClick={toggleMicrophone}
          aria-label={voice?.state?.handsFree ? 'Mikrofon kikapcsolása' : 'Mikrofon bekapcsolása'}
        >
          {voice?.state?.handsFree ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
        <div className={active ? 'jarvis-waveform is-active' : 'jarvis-waveform'} aria-hidden="true">
          <svg viewBox="0 0 760 52" preserveAspectRatio="none">
            <polyline className="voice-wave voice-wave-soft" points="0,26 38,26 54,25 68,27 82,23 94,29 106,20 116,32 126,17 136,35 146,13 156,38 166,19 176,31 188,22 198,29 210,18 220,34 230,11 240,40 250,15 260,36 270,20 280,30 290,16 300,37 310,9 320,43 330,14 340,39 350,18 360,34 370,12 380,42 390,16 400,37 410,21 420,31 430,17 440,36 450,12 460,41 470,18 480,34 490,22 500,30 510,19 520,33 530,16 540,37 550,21 560,31 570,23 580,29 590,20 600,33 610,22 620,30 632,24 646,28 660,25 676,27 694,25 714,26 736,26 760,26" />
            <polyline className="voice-wave voice-wave-main" points="0,26 42,26 58,24 70,28 82,21 92,31 102,17 112,35 122,12 132,40 142,18 152,34 162,9 172,43 182,16 192,36 202,20 212,31 222,14 232,39 242,7 252,45 262,12 272,41 282,17 292,35 302,10 312,44 322,5 332,47 342,13 352,39 362,18 372,34 382,8 392,45 402,14 412,40 422,20 432,32 442,12 452,42 462,9 472,44 482,16 492,37 502,21 512,31 522,15 532,39 542,18 552,35 562,22 572,30 582,17 592,36 602,20 612,33 622,22 634,30 646,23 660,29 674,24 690,28 708,25 728,27 744,26 760,26" />
          </svg>
        </div>
        <button type="button" className="jarvis-wave-stop" onClick={() => voice?.setHandsFree?.(false)} aria-label="Hangvezérlés leállítása">
          <Square size={15} />
        </button>
        <div className={micError ? 'jarvis-wave-status is-error' : 'jarvis-wave-status'}>{status}</div>
      </div>
    </section>
  );
}
