import { useMemo, useState } from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { jarvis } from '@/api/jarvisClient';
import { canvasToBlob } from '@/lib/canvasOptimization.js';
import { calculateOutpaintGeometry } from '@/lib/outpaintGeometry';
import { useLang } from '@/lib/i18n';

export default function OutpaintPanel({ layers, CANVAS_W, CANVAS_H, onOutpaintComplete }) {
  const { lang } = useLang();
  const hu = lang === 'hu';
  const tx = (huText, enText) => hu ? huText : enText;
  const directions = [
    { id:'up', label:tx('⬆️ Felfelé','⬆️ Up') },
    { id:'down', label:tx('⬇️ Lefelé','⬇️ Down') },
    { id:'left', label:tx('⬅️ Balra','⬅️ Left') },
    { id:'right', label:tx('➡️ Jobbra','➡️ Right') },
    { id:'all', label:tx('🔲 Minden oldal','🔲 All sides') },
  ];

  const [direction, setDirection] = useState('all');
  const [expandPercent, setExpandPercent] = useState(30);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');

  const geometry = useMemo(
    () => calculateOutpaintGeometry(CANVAS_W, CANVAS_H, expandPercent, direction),
    [CANVAS_W, CANVAS_H, expandPercent, direction]
  );

  const apply = async () => {
    if (loading || !layers.length) return;
    setLoading(true);
    setError('');
    setStep(tx('Kép előkészítése...','Preparing image...'));

    try {
      const merged = document.createElement('canvas');
      merged.width = CANVAS_W;
      merged.height = CANVAS_H;
      const mCtx = merged.getContext('2d');
      if (!mCtx) throw new Error(tx('A vászon nem érhető el.','Canvas unavailable.'));
      layers.forEach((layer) => {
        if (layer.visible && layer.canvas) mCtx.drawImage(layer.canvas, 0, 0);
      });

      const blob = await canvasToBlob(merged, 'image/png', 0.9);
      if (!blob) throw new Error(tx('A kép előkészítése sikertelen.','Could not prepare image.'));
      const file = new File([blob], 'source.png', { type:'image/png' });

      setStep(tx('Kép feltöltése...','Uploading image...'));
      const uploadRes = await jarvis.integrations.Core.UploadFile({file});
      const fileUrl = String(uploadRes?.file_url || '').trim();
      if (!fileUrl) throw new Error(tx('A feltöltés nem adott vissza használható kép URL-t.','Upload returned no usable image URL.'));

      setStep(tx('Kitöltési prompt generálása...','Generating fill prompt...'));
      const { invokeWithRetry } = await import('@/lib/llmGateway');
      const analysisRaw = await invokeWithRetry({
        prompt: `Extend this image ${direction === 'all' ? 'on every side' : direction}. Write one detailed English outpainting prompt that keeps the original style, lighting, perspective and content consistent. Return only the prompt.`,
        file_urls:[fileUrl],
      });
      const outpaintPrompt = String(
        typeof analysisRaw === 'string' ? analysisRaw : (analysisRaw?.result || analysisRaw?.data?.result || '')
      ).trim() || 'Seamless continuation of the original image, preserving style, lighting, perspective and visual continuity.';

      setStep(tx('AI kitöltés...','AI outpainting...'));
      const generated = await jarvis.integrations.Core.GenerateImage({
        prompt:`${outpaintPrompt}. Canvas size: ${geometry.newW}x${geometry.newH}px. Original image at position (${geometry.offsetX}, ${geometry.offsetY}) with size ${CANVAS_W}x${CANVAS_H}px. Seamless blending.`,
        existing_image_urls:[fileUrl],
      });
      const generatedUrl = String(generated?.url || '').trim();
      if (!generatedUrl) throw new Error(tx('A képgenerálás nem adott vissza eredményt.','Image generation returned no result.'));

      onOutpaintComplete({
        url:generatedUrl,
        newW:geometry.newW,
        newH:geometry.newH,
        offsetX:geometry.offsetX,
        offsetY:geometry.offsetY,
      });
      setStep('');
    } catch (err) {
      setStep('');
      setError(err?.message || tx('Ismeretlen hiba történt.','Unknown error.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-64 bg-card border-l border-border flex flex-col shrink-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Wand2 size={13} className="text-accent" />
        <span className="text-xs font-semibold text-foreground">{tx('Generatív kitöltés','Generative Fill')}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">{tx('Kiterjesztés iránya','Expansion direction')}</p>
          <div className="grid grid-cols-2 gap-1">
            {directions.map((item) => (
              <button
                key={item.id}
                onClick={() => { setDirection(item.id); setError(''); }}
                className={`py-2 px-2 rounded-lg border text-[10px] font-medium transition-all ${
                  direction === item.id
                    ? 'bg-accent/15 border-accent text-accent'
                    : 'bg-secondary border-border text-foreground hover:border-accent/50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">{tx('Kiterjesztés mértéke','Expansion amount')}</p>
            <span className="text-xs font-mono text-primary">{expandPercent}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            value={expandPercent}
            onChange={(e) => { setExpandPercent(Number(e.target.value)); setError(''); }}
            className="w-full accent-accent h-1"
            disabled={loading}
          />
          <p className="text-[9px] text-muted-foreground">
            {tx('Új méret','New size')}: {geometry.newW}×{geometry.newH}px
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[10px] leading-relaxed text-destructive">
            {error}
          </div>
        )}

        <button
          onClick={apply}
          disabled={loading || !layers.length}
          className="w-full py-2 rounded-lg bg-accent text-accent-foreground text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
          {loading ? (step || tx('Feldolgozás...','Processing...')) : tx('Kiterjesztés','Expand')}
        </button>
      </div>
    </div>
  );
}
