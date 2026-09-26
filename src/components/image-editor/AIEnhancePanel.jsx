import { useState } from 'react';
import { Sparkles, Loader2, Trash2, Wand2 } from 'lucide-react';
import { jarvis } from '@/api/jarvisClient';
import { canvasToBlob } from '@/lib/canvasOptimization.js';
import { imageOpQueue } from '@/components/image-editor/ImageOperationQueue';

export default function AIEnhancePanel({ layers, activeLayer, CANVAS_W, CANVAS_H, onEnhanceComplete }) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');

  // FIX #8: Use operation queue to prevent concurrent operations
  const applyEnhance = async (mode) => {
    if (loading || !layers[activeLayer]) return;
    
    // Enqueue this operation to run sequentially
    imageOpQueue.enqueue(async () => {
      setLoading(true);

    try {
      // 1. Extract active layer (async, non-blocking)
      const layer = layers[activeLayer];
      const blob = await canvasToBlob(layer.canvas, 'image/png', 0.9);
      const file = new File([blob], `${mode}.png`, { type: 'image/png' });

      setStep(`Réteg feltöltése...`);
      const uploadForm = new FormData();
      uploadForm.append('file', file);
      const uploadRes = await jarvis.functions.invoke('validateFileUpload', uploadForm);
      const file_url = uploadRes?.data?.file_url;
      if (!file_url) throw new Error('Upload failed');

      // 2. Generate enhancement
      setStep(`AI ${mode === 'enhance' ? 'javítás' : 'háttér eltávolítás'}...`);
      const prompt = mode === 'enhance'
        ? `Enhance this image: sharpen details, improve clarity, boost colors, reduce noise, increase quality. Keep the same composition.`
        : `Remove the background from this image. Make it transparent. Keep the subject intact with clean edges.`;

      const { url: enhancedUrl } = await jarvis.integrations.Core.GenerateImage({
        prompt,
        existing_image_urls: [file_url],
      });

      setStep('');
       onEnhanceComplete(enhancedUrl);
      } catch (err) {
       console.error('[AIEnhancePanel]', err?.message);
       // FIX #10: Validate image size in error (file is in scope from above)
       const isTooLarge = err?.message?.includes('413') || err?.message?.includes('file');
       if (isTooLarge) {
         setStep('Hiba: Túl nagy kép (max 10MB). Csökkentsd a felbontást.');
       } else {
         setStep('Hiba történt — próbáld újra.');
       }
      } finally {
       setLoading(false);
      }
      });
      };

  return (
    <div className="w-64 bg-card border-l border-border flex flex-col shrink-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Sparkles size={13} className="text-accent" />
        <span className="text-xs font-semibold text-foreground">AI Képjavítás</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {/* Enhance button */}
        <button
          onClick={() => applyEnhance('enhance')}
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-accent text-accent-foreground text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {loading && step.includes('javítás') ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
          {loading && step.includes('javítás') ? 'Javítás alatt...' : '✨ Kép javítása'}
        </button>

        {/* Background removal button */}
        <button
          onClick={() => applyEnhance('remove-bg')}
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {loading && step.includes('háttér') ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          {loading && step.includes('háttér') ? 'Eltávolítás alatt...' : '🎯 Háttér eltávolítása'}
        </button>

        {step && !loading && (
          <p className="text-[10px] text-muted-foreground text-center py-2">{step}</p>
        )}

        <p className="text-[10px] text-muted-foreground border-t border-border/50 pt-2 mt-2">
          Az AI az aktív réteget dolgozza fel. Az eredmény az eredeti réteg helyére kerül.
        </p>
      </div>
    </div>
  );
}