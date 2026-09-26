import { useMemo } from 'react';

const FACE_IMAGE_URL = 'https://media.jarvis.com/images/public/69d0285d21a65c84c1982a2b/970a5b678_images.jpeg';

export default function ImageAvatarFace({ expression = 'neutral' }) {
  const isSpeaking = expression === 'speaking';
  const isListening = expression === 'listening';
  const isThinking = expression === 'thinking';

  const faceAnimation = useMemo(() => {
    if (isSpeaking) return 'animate-[avatarTalk_1.4s_ease-in-out_infinite]';
    if (isListening) return 'animate-[avatarListen_2.2s_ease-in-out_infinite]';
    if (isThinking) return 'animate-[avatarThink_2.8s_ease-in-out_infinite]';
    return 'animate-[avatarIdle_4s_ease-in-out_infinite]';
  }, [isSpeaking, isListening, isThinking]);

  return (
    <div className="relative mx-auto flex h-[38vh] min-h-[260px] max-h-[390px] w-full items-center justify-center overflow-hidden">
      <style>{`
        @keyframes avatarIdle { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-5px) scale(1.01); } }
        @keyframes avatarListen { 0%,100% { transform: translateY(0) rotate(-0.6deg); } 50% { transform: translateY(-7px) rotate(0.6deg); } }
        @keyframes avatarThink { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-4px) rotate(-1.2deg); } }
        @keyframes avatarTalk { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-6px) scale(1.015); } }
        @keyframes avatarBlink { 0%, 88%, 100% { transform: scaleY(0); } 91%, 94% { transform: scaleY(1); } }
        @keyframes avatarMouth { 0%,100% { height: 5px; width: 64px; border-radius: 999px; opacity: .7; } 18% { height: 20px; width: 52px; border-radius: 45% 45% 55% 55%; opacity: 1; } 42% { height: 10px; width: 70px; opacity: .85; } 68% { height: 26px; width: 48px; border-radius: 45% 45% 60% 60%; opacity: 1; } }
        @keyframes avatarEyeLook { 0%,100% { transform: translate(0,0); } 25% { transform: translate(3px,-1px); } 55% { transform: translate(-3px,1px); } 75% { transform: translate(1px,0); } }
        @keyframes avatarBrowLeft { 0%,100% { transform: rotate(-8deg) translateY(0); } 45% { transform: rotate(-13deg) translateY(-2px); } }
        @keyframes avatarBrowRight { 0%,100% { transform: rotate(8deg) translateY(0); } 45% { transform: rotate(13deg) translateY(-2px); } }
        @keyframes avatarGlow { 0%,100% { opacity: .2; transform: scale(.95); } 50% { opacity: .42; transform: scale(1.04); } }
      `}</style>

      <div className="absolute inset-x-10 bottom-6 top-8 rounded-full bg-primary/20 blur-3xl animate-[avatarGlow_3s_ease-in-out_infinite]" />

      <div className={`relative aspect-square h-full max-h-[380px] overflow-hidden rounded-[2rem] border border-border bg-secondary shadow-2xl shadow-black/30 ${faceAnimation}`}>
        <img
          src={FACE_IMAGE_URL}
          alt="Mozgó asszisztens arc"
          className="h-full w-full object-cover"
          draggable={false}
        />

        <div className="pointer-events-none absolute left-[25.5%] top-[31.5%] h-1.5 w-[21%] rounded-full bg-stone-950/45 blur-[.2px] animate-[avatarBrowLeft_3.1s_ease-in-out_infinite]" />
        <div className="pointer-events-none absolute right-[25.5%] top-[31.5%] h-1.5 w-[21%] rounded-full bg-stone-950/45 blur-[.2px] animate-[avatarBrowRight_3.1s_ease-in-out_infinite]" />

        <div className="pointer-events-none absolute left-[35%] top-[38.5%] h-3 w-3 rounded-full bg-slate-950/35 shadow-[0_0_8px_rgba(255,255,255,.3)_inset] animate-[avatarEyeLook_3.6s_ease-in-out_infinite]" />
        <div className="pointer-events-none absolute right-[35%] top-[38.5%] h-3 w-3 rounded-full bg-slate-950/35 shadow-[0_0_8px_rgba(255,255,255,.3)_inset] animate-[avatarEyeLook_3.6s_ease-in-out_infinite]" />
        <div className="pointer-events-none absolute left-[29.5%] top-[35.5%] h-[6%] w-[17%] origin-center rounded-full bg-card/80 animate-[avatarBlink_4.8s_ease-in-out_infinite]" />
        <div className="pointer-events-none absolute right-[29.5%] top-[35.5%] h-[6%] w-[17%] origin-center rounded-full bg-card/80 animate-[avatarBlink_4.8s_ease-in-out_infinite]" />

        <div className="pointer-events-none absolute left-1/2 top-[66.5%] flex -translate-x-1/2 items-center justify-center">
          <div className={`rounded-full border border-pink-100/60 bg-gradient-to-b from-pink-200 via-rose-500 to-rose-950 shadow-lg shadow-rose-950/40 ${isSpeaking ? 'animate-[avatarMouth_.36s_ease-in-out_infinite]' : 'h-[5px] w-16 opacity-65'}`} />
        </div>

        <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-gradient-to-t from-background/20 via-transparent to-white/5" />
      </div>
    </div>
  );
}