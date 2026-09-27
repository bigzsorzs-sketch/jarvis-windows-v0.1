import { motion } from 'framer-motion';
import { Mic, MicOff, Square } from 'lucide-react';

export default function JarvisVoiceStage({ voice, title = "Hi, I'm Jarvis.", subtitle = 'I can think, plan, create, and take action with you.' }) {
  const phase = voice?.state?.phase || 'idle';
  const active = ['listening','processing','speaking'].includes(phase);
  const listening = phase === 'listening';
  const speaking = phase === 'speaking';

  const status = speaking ? 'Beszélek…' : phase === 'processing' ? 'Gondolkodom…' : listening ? 'Figyelek…' : 'Speak naturally… I’m listening.';

  return (
    <section className="jarvis-command-stage" aria-label="Jarvis voice command center">
      <div className={active ? 'jarvis-energy-field is-active' : 'jarvis-energy-field'} aria-hidden="true">
        <svg viewBox="0 0 1200 220" preserveAspectRatio="none">
          <path className="energy-wave wave-one" d="M0 112 C90 35 150 35 240 112 S390 189 480 112 S630 35 720 112 S870 189 960 112 S1110 35 1200 112" />
          <path className="energy-wave wave-two" d="M0 112 C90 178 150 178 240 112 S390 46 480 112 S630 178 720 112 S870 46 960 112 S1110 178 1200 112" />
          <path className="energy-wave wave-three" d="M0 112 C110 72 170 72 260 112 S410 152 500 112 S650 72 740 112 S890 152 980 112 S1120 72 1200 112" />
        </svg>
      </div>

      <motion.div
        className={active ? 'jarvis-hero-orb is-active' : 'jarvis-hero-orb'}
        animate={{ scale: active ? [1, 1.045, 1] : [1, 1.018, 1], rotate: [0, 2, -2, 0] }}
        transition={{ duration: active ? 1.5 : 4.8, repeat: Infinity, ease: 'easeInOut' }}
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

      <div className={active ? 'jarvis-wave-console is-active' : 'jarvis-wave-console'}>
        <button
          type="button"
          className={voice?.state?.handsFree ? 'jarvis-wave-mic enabled' : 'jarvis-wave-mic'}
          onClick={() => voice?.setHandsFree?.(!voice.state.handsFree)}
          aria-label={voice?.state?.handsFree ? 'Mikrofon kikapcsolása' : 'Mikrofon bekapcsolása'}
        >
          {voice?.state?.handsFree ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
        <div className={active ? 'jarvis-waveform is-active' : 'jarvis-waveform'} aria-hidden="true">
          <svg viewBox="0 0 760 52" preserveAspectRatio="none">
            <path className="voice-wave voice-wave-soft" d="M0 26 C30 25 45 24 65 26 C86 29 99 34 116 26 C132 17 144 7 160 26 C177 46 190 38 205 26 C220 13 232 18 246 26 C260 34 271 43 286 26 C300 9 314 3 330 26 C347 50 359 42 374 26 C389 10 401 14 416 26 C432 39 444 45 459 26 C474 7 489 9 505 26 C521 43 535 37 551 26 C568 15 581 18 598 26 C615 34 631 30 648 26 C670 22 695 26 715 26 C733 26 747 25 760 26" />
            <path className="voice-wave voice-wave-main" d="M0 26 C35 26 51 23 70 26 C89 30 103 38 120 26 C136 14 147 2 164 26 C181 50 194 41 210 26 C226 10 238 16 253 26 C268 36 279 48 294 26 C309 4 323 0 339 26 C355 52 369 44 384 26 C399 8 412 12 427 26 C443 41 456 48 471 26 C486 4 501 7 517 26 C533 45 548 39 564 26 C581 13 594 16 611 26 C628 36 643 31 660 26 C681 21 703 27 721 26 C738 25 750 26 760 26" />
          </svg>
        </div>
        <button type="button" className="jarvis-wave-stop" onClick={() => voice?.setHandsFree?.(false)} aria-label="Hangvezérlés leállítása">
          <Square size={15} />
        </button>
        <div className="jarvis-wave-status">{status}</div>
      </div>
    </section>
  );
}
