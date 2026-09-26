import { useState } from 'react';
import { Wand2, Loader2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { jarvis } from '@/api/jarvisClient';
import { canvasToBlob } from '@/lib/canvasOptimization.js';

const DIRECTIONS = [
  { id: 'up', label: '⬆️ Felfelé', icon: ArrowUp },
  { id: 'down', label: '⬇️ Lefelé', icon: ArrowDown },
  { id: 'left', label: '⬅️ Balra', icon: ArrowLeft },
  { id: 'right', label: '➡️ Jobbra', icon: ArrowRight },
  { id: 'all', label: '🔲 Összes oldal', icon: null },
];

export default function OutpaintPanel({ layers, CANVAS_W, CANVAS_H, onOutpaintComplete }) {
  const [direction, setDirection] = useState('all');
  const [expandPercent, setExpandPercent] = useState(30);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');

  const apply = async () => {
    if (loading || !layers.length) return;
    setLoading(true);
    setStep('Kép feltöltése...');

    try {
      // 1. Merge visible layers
      const merged = document.createElement('canvas');
      merged.width = CANVAS_W;
      merged.height = CANVAS_H;
      const mCtx = merged.getContext('2d');
      layers.forEach(l => {
        if (l.visible) mCtx.drawImage(l.canvas, 0, 0);
      });

      // 2. Upload source image (async, non-blocking)
      const blob = await canvasToBlob(merged, 'image/png', 0.9);
      const file = new File([blob], 'source.png', { type: 'image/png' });
      const uploadRes = await jarvis.functions.invoke('validateFileUpload', { file });
      const file_url = uploadRes?.data?.file_url;

      // 3. Calculate new dimensions
      const expandPx = Math.round((expandPercent / 100) * CANVAS_W);
      let newW = CANVAS_W;
      let newH = CANVAS_H;
      let offsetX = 0, offsetY = 0;

      if (direction === 'up' || direction === 'down' || direction === 'all') {
        newH += expandPx * (direction === 'all' ? 2 : 1);
        if (direction === 'down' || direction === 'all') offsetY = expandPx * (direction === 'all' ? 1 : 0);
      }
      if (direction === 'left' || direction === 'right' || direction === 'all') {
        newW += expandPx * (direction === 'all' ? 2 : 1);
        if (direction === 'right' || direction === 'all') offsetX = expandPx * (direction === 'all' ? 1 : 0);
      }

      // 4. Generate outpainting prompt
      setStep('Kitöltési prompt generálása...');
      const { invokeWithRetry } = await import('@/lib/llmGateway');
      const analysisRaw = await invokeWithRetry({
        prompt: `Ez egy kép, amit szeretnék kiterjeszteni: ${direction === 'all' ? 'minden irányba' : direction === 'up' ? 'felfelé' : direction === 'down' ? 'lefelé' : direction === 'left' ? 'balra' : 'jobbra'}.\n\nAz eredeti kép alapján készíts egy részletes angol-nyelvű outpainting promptot, amely leírja, hogyan nézzen ki a bővített terület. A prompt legyen konzisztens az eredeti kép stílusával és tartalmával. Csak a promptot add vissza, semmi mást.`,
        file_urls: [file_url],
      });
      const outpaintPrompt = typeof analysisRaw === 'string' ? analysisRaw : (analysisRaw?.result || 'Extended and seamless outpainting');

      // 5. Generate expanded image
      setStep('AI kitöltés...');
      const generated = await jarvis.integrations.Core.GenerateImage({
        prompt: `${outpaintPrompt}. Canvas size: ${newW}x${newH}px. Original image at position (${offsetX}, ${offsetY}) with size ${CANVAS_W}x${CANVAS_H}px. Seamless blending.`,
        existing_image_urls: [file_url],
      });

      setStep('');
      onOutpaintComplete({
        url: generated.url,
        newW,
        newH,
        offsetX,
        offsetY,
      });
    } catch (err) {
      setStep(`Hiba: ${err?.message || 'Ismeretlen hiba'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-64 bg-card border-l border-border flex flex-col shrink-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Wand2 size={13} className="text-accent" />
        <span className="text-xs font-semibold text-foreground">Generative Fill</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {/* Direction selector */}
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Kiterjesztés iránya</p>
          <div className="grid grid-cols-2 gap-1">
            {DIRECTIONS.map(d => (
              <button
                key={d.id}
                onClick={() => setDirection(d.id)}
                className={`py-2 px-2 rounded-lg border text-[10px] font-medium transition-all ${
                  direction === d.id
                    ? 'bg-accent/15 border-accent text-accent'
                    : 'bg-secondary border-border text-foreground hover:border-accent/50'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Expand percentage slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Kiterjesztés mértéke</p>
            <span className="text-xs font-mono text-primary">{expandPercent}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            value={expandPercent}
            onChange={e => setExpandPercent(+e.target.value)}
            className="w-full accent-accent h-1"
            disabled={loading}
          />
          <p className="text-[9px] text-muted-foreground">
            Új méret: {Math.round(CANVAS_W * (1 + (expandPercent/100) * (direction === 'all' ? 2 : 1)))}×{Math.round(CANVAS_H * (1 + (expandPercent/100) * (direction === 'all' ? 2 : 1)))}px
          </p>
        </div>

        {/* Apply button */}
        <button
          onClick={apply}
          disabled={loading}
          className="w-full py-2 rounded-lg bg-accent text-accent-foreground text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
          {loading ? (step || 'Feldolgozás...') : 'Kiterjesztés'}
        </button>
      </div>
    </div>
  );
}