export default function AvatarFallback2D({ expression = 'neutral' }) {
  const speaking = expression === 'speaking';
  const thinking = expression === 'thinking';
  const listening = expression === 'listening';
  const error = expression === 'error';

  return (
    <div className="relative w-64 h-64 mx-auto flex items-center justify-center">
      <div className={`absolute inset-0 rounded-full bg-primary/10 ${thinking ? 'animate-ping' : 'animate-pulse'}`} />
      <div className="relative w-48 h-56 rounded-[45%] bg-gradient-to-b from-[#f2c7a6] to-[#d99877] shadow-2xl border border-white/10">
        <div className="absolute top-20 left-12 w-5 h-5 rounded-full bg-slate-900" />
        <div className="absolute top-20 right-12 w-5 h-5 rounded-full bg-slate-900" />
        <div className={`absolute top-14 left-10 w-10 h-1 bg-slate-800 rounded-full transition-transform ${thinking ? 'rotate-12' : listening ? '-rotate-6' : ''}`} />
        <div className={`absolute top-14 right-10 w-10 h-1 bg-slate-800 rounded-full transition-transform ${thinking ? '-rotate-12' : listening ? 'rotate-6' : ''}`} />
        <div className={`absolute left-1/2 -translate-x-1/2 bottom-16 bg-slate-900 rounded-full transition-all ${speaking ? 'w-14 h-8 animate-pulse' : error ? 'w-12 h-2' : 'w-16 h-3'}`} />
        <div className="absolute left-8 top-32 w-8 h-4 rounded-full bg-pink-300/45" />
        <div className="absolute right-8 top-32 w-8 h-4 rounded-full bg-pink-300/45" />
      </div>
    </div>
  );
}