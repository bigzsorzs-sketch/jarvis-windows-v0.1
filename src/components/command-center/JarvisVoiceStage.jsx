import { motion } from 'framer-motion';
import { Mic, MicOff, Square } from 'lucide-react';

const BARS = [12,18,9,22,14,30,17,38,24,44,20,34,16,28,12,20,10];

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
        <div className="jarvis-waveform" aria-hidden="true">
          {BARS.map((height, index) => (
            <motion.span
              key={index}
              animate={active ? { height: [Math.max(4,height * .25), height, Math.max(5,height * .45)] } : { height: 4 }}
              transition={{ duration: speaking ? .42 : .7, repeat: active ? Infinity : 0, delay: index * .035, ease: 'easeInOut' }}
            />
          ))}
        </div>
        <button type="button" className="jarvis-wave-stop" onClick={() => voice?.setHandsFree?.(false)} aria-label="Hangvezérlés leállítása">
          <Square size={15} />
        </button>
        <div className="jarvis-wave-status">{status}</div>
      </div>
    </section>
  );
}
