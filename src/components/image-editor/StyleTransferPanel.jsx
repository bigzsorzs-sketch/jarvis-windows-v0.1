import { useState, useRef } from 'react';
import { Palette, Upload, X, Loader2, Sparkles } from 'lucide-react';
import { jarvis } from '@/api/jarvisClient';
import { canvasToBlob } from '@/lib/canvasOptimization.js';

const PRESET_STYLES = [
  { id: 'impressionist', label: 'Impresszionista', emoji: '🎨', prompt: 'Impressionist painting style, loose brushstrokes, vibrant colors, painterly, like Monet or Renoir' },
  { id: 'watercolor', label: 'Akvarell', emoji: '💧', prompt: 'Watercolor painting style, soft washes, delicate edges, translucent layers, paper texture' },
  { id: 'oilpainting', label: 'Olajfesték', emoji: '🖼️', prompt: 'Classic oil painting style, rich colors, visible brushwork, old master technique, varnished texture' },
  { id: 'cyberpunk', label: 'Cyberpunk', emoji: '🌆', prompt: 'Cyberpunk neon style, dark background, glowing neon lights, futuristic, high contrast, rain and reflections' },
  { id: 'sketch', label: 'Ceruza rajz', emoji: '✏️', prompt: 'Pencil sketch style, grayscale, crosshatching, fine lines, hand-drawn illustration' },
  { id: 'anime', label: 'Anime', emoji: '🌸', prompt: 'Anime art style, cell shading, clean lines, vibrant flat colors, Japanese animation aesthetic' },
  { id: 'vintage', label: 'Vintage fotó', emoji: '📷', prompt: 'Vintage photograph style, sepia tones, film grain, faded colors, aged paper texture, retro 1960s look' },
  { id: 'pixelart', label: 'Pixel art', emoji: '👾', prompt: 'Pixel art style, 8-bit retro game aesthetic, blocky pixels, limited color palette' },
  { id: 'abstract', label: 'Absztrakt', emoji: '🔶', prompt: 'Abstract expressionist style, bold geometric shapes, dynamic composition, vivid colors, non-representational' },
  { id: 'gothic', label: 'Gótikus', emoji: '🏰', prompt: 'Gothic dark fantasy art style, dramatic shadows, ornate details, dark moody atmosphere, medieval aesthetic' },
];

export default function StyleTransferPanel({ layers, CANVAS_W, CANVAS_H, maskRect, onStyleResult }) {
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [refImage, setRefImage] = useState(null); // { url, file }
  const [target, setTarget] = useState('layer'); // 'layer' | 'canvas' | 'mask'
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');
  const fileRef = useRef(null);

  const hasMask = maskRect && Math.abs(maskRect.w) > 4 && Math.abs(maskRect.h) > 4;
  const visibleLayers = layers.filter(layer => layer.visible && layer.canvas);
  const canApply = (selectedPreset || refImage) && visibleLayers.length > 0 && (target !== 'mask' || hasMask);

  const handleRefUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setRefImage({ file, url: URL.createObjectURL(file) });
    setSelectedPreset(null);
  };

  const removeRef = () => {
    if (refImage) URL.revokeObjectURL(refImage.url);
    setRefImage(null);
  };

  const apply = async () => {
    if (!canApply) return;
    setLoading(true);

    try {
      // 1. Capture source image (active layer, whole canvas or masked region)
      const merged = document.createElement('canvas');
      let srcX = 0, srcY = 0, srcW = CANVAS_W, srcH = CANVAS_H;
      
      if (target === 'mask' && hasMask) {
        srcX = Math.min(maskRect.x, maskRect.x + maskRect.w);
        srcY = Math.min(maskRect.y, maskRect.y + maskRect.h);
        srcW = Math.abs(maskRect.w);
        srcH = Math.abs(maskRect.h);
      }
      
      merged.width = srcW;
      merged.height = srcH;
      const mCtx = merged.getContext('2d');
      
      if (target === 'layer') {
        // Only apply to active layer
        const activeLayer = visibleLayers[visibleLayers.length - 1]; // Last visible layer
        if (activeLayer?.visible) {
          mCtx.drawImage(activeLayer.canvas, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
        }
      } else {
        // Apply to all visible layers
        layers.forEach(l => {
          if (l.visible) mCtx.drawImage(l.canvas, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
        });
      }

      // 1. Upload source through validated endpoint (async, non-blocking)
      setStep('Forrás feltöltése...');
      const blob = await canvasToBlob(merged, 'image/png', 0.9);
      const srcFile = new File([blob], 'source.png', { type: 'image/png' });
      const srcUploadRes = await jarvis.integrations.Core.UploadFile({file:srcFile});
      const srcUrl = srcUploadRes?.file_url;
      if (!srcUrl) throw new Error('Source upload failed');

      // 2. Upload reference image if custom
      let refUrl = null;
      if (refImage) {
        setStep('Referencia feltöltése...');
        const refUploadRes = await jarvis.integrations.Core.UploadFile({file:refImage.file});
        refUrl = refUploadRes?.file_url;
        if (!refUrl) throw new Error('Reference upload failed');
      }

      // 3. Build style prompt via hardened llmProxy
      let styleDescription = selectedPreset?.prompt || '';
      if (refUrl) {
        setStep('Referencia stílusának elemzése...');
        const analysisRes = await jarvis.functions.invoke('llmProxy', {
          prompt: 'Describe the artistic style of this image in detail for use as a style transfer prompt. Focus on: color palette, brushwork, texture, mood, lighting, and overall aesthetic. Return only the style description, nothing else.',
          file_urls: [refUrl],
          model: 'gemini_3_flash',
        });
        const raw = analysisRes?.data?.result ?? analysisRes?.data;
        styleDescription = typeof raw === 'string' ? raw : '';
      }

      // 4. Build final generation prompt via hardened llmProxy
      setStep('Stílus átvitele...');
      const genPromptRes = await jarvis.functions.invoke('llmProxy', {
        prompt: `You have a source image. Apply this artistic style to it:\n\nSTYLE: ${styleDescription}\n\nCreate a detailed image generation prompt in English that describes how the source image should look when rendered in this style. Keep the original content/composition but transform the artistic style completely. Return only the prompt.`,
        file_urls: [srcUrl],
        model: 'gemini_3_flash',
      });
      const rawPrompt = genPromptRes?.data?.result ?? genPromptRes?.data;
      const genPrompt = typeof rawPrompt === 'string' ? rawPrompt : styleDescription;

      // 5. Generate styled image
      setStep('AI generálás...');
      const refUrls = [srcUrl];
      if (refUrl) refUrls.push(refUrl);
      const generated = await jarvis.integrations.Core.GenerateImage({
        prompt: genPrompt,
        existing_image_urls: refUrls.slice(0, 5),
      });

      onStyleResult({
        url: generated.url,
        x: srcX, y: srcY, w: srcW, h: srcH,
        prompt: genPrompt,
      });
      setStep('');
    } catch (err) {
      console.error('[StyleTransferPanel]', err?.message);
      setStep('Hiba történt — próbáld újra.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-56 bg-card border-l border-border flex flex-col shrink-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <Palette size={13} className="text-primary" />
        <span className="text-xs font-semibold text-foreground">Stílusátvitel</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* Target selector */}
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Célterület</p>
          <div className="flex gap-1 flex-wrap">
            {['layer', 'canvas', 'mask'].map(t => (
              <button
                key={t}
                onClick={() => setTarget(t)}
                disabled={(t === 'mask' && !hasMask)}
                className={`flex-1 min-w-[60px] py-1 rounded-lg text-[10px] font-medium border transition-all disabled:opacity-30 ${
                  target === t
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary text-foreground border-border hover:border-primary/50'
                }`}
              >
                {t === 'layer' ? '📄 Réteg' : t === 'canvas' ? '🖼️ Egész' : '🎯 Maszk'}
              </button>
            ))}
          </div>
          {target === 'mask' && !hasMask && (
            <p className="text-[10px] text-destructive">Húzz ki AI maszkot a vásznon!</p>
          )}
        </div>

        {/* Preset styles */}
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Előre beállított stílusok</p>
          <div className="grid grid-cols-2 gap-1">
            {PRESET_STYLES.map(s => (
              <button
                key={s.id}
                onClick={() => { setSelectedPreset(prev => prev?.id === s.id ? null : s); setRefImage(null); removeRef(); }}
                className={`flex flex-col items-center py-1.5 px-1 rounded-lg border text-[10px] font-medium transition-all ${
                  selectedPreset?.id === s.id
                    ? 'bg-primary/15 border-primary text-primary'
                    : 'bg-secondary border-border text-foreground hover:border-primary/50'
                }`}
              >
                <span className="text-base leading-none mb-0.5">{s.emoji}</span>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reference image */}
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Referencia kép</p>
          {refImage ? (
            <div className="relative group rounded-lg overflow-hidden border border-border">
              <img src={refImage.url} alt="ref" className="w-full h-20 object-cover" />
              <button
                onClick={removeRef}
                className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={10} className="text-white" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[9px] text-white px-1.5 py-0.5">
                Referencia kép aktív
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 border-dashed border-border hover:border-primary text-muted-foreground hover:text-primary transition-colors text-[11px]"
            >
              <Upload size={12} /> Kép feltöltése
            </button>
          )}
        </div>

        {/* Apply button */}
        <button
          onClick={apply}
          disabled={loading || !canApply}
          className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {loading ? (step || 'Feldolgozás...') : 'Stílus alkalmazása'}
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleRefUpload} />
    </div>
  );
}
