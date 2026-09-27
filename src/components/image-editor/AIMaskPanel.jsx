import { useState } from 'react';
import { Wand2, Loader2, Trash2 } from 'lucide-react';
import { jarvis } from '@/api/jarvisClient';
import { canvasToBlob } from '@/lib/canvasOptimization.js';

export default function AIMaskPanel({ maskRect, onClearMask, layers, CANVAS_W, CANVAS_H, onMaskResult }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');

  const hasMask = maskRect && maskRect.w > 4 && maskRect.h > 4;

  const apply = async () => {
    if (!hasMask || !prompt.trim()) return;
    setLoading(true);
    setStep('Kijelölt terület kivágása...');

    try {
      // 1. Extract the masked region as a cropped canvas (async, non-blocking)
      const { x, y, w, h } = maskRect;
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = Math.abs(w);
      cropCanvas.height = Math.abs(h);
      const cropCtx = cropCanvas.getContext('2d');
      // Composite all visible layers into crop
      layers.forEach(l => {
        if (l.visible) cropCtx.drawImage(l.canvas, Math.min(x, x+w), Math.min(y, y+h), Math.abs(w), Math.abs(h), 0, 0, Math.abs(w), Math.abs(h));
      });

      // 2. Upload the cropped region through validated endpoint (async toBlob)
      setStep('Feltöltés...');
      const blob = await canvasToBlob(cropCanvas, 'image/png', 0.9);
      const file = new File([blob], 'mask_region.png', { type: 'image/png' });
      const uploadForm = new FormData();
      uploadForm.append('file', file);
      const uploadRes = await jarvis.functions.invoke('validateFileUpload', uploadForm);
      const file_url = uploadRes?.data?.file_url;
      if (!file_url) throw new Error('Upload failed');

      // 3. Ask LLM via hardened proxy
      setStep('AI elemzés...');
      const analysisRes = await jarvis.functions.invoke('llmProxy', {
        prompt: `A felhasználó egy képrészletet küldött és ezt az utasítást adta: "${prompt}"\n\nKészíts egy részletes képgenerálási promptot angolul, ami pontosan leírja, hogyan nézzen ki ez a terület az utasítás alapján. Csak a promptot add vissza, semmi mást.`,
        file_urls: [file_url],
        model: 'gemini_3_flash',
      });
      const genPrompt = typeof analysisRes?.data?.result === 'string'
        ? analysisRes.data.result
        : (analysisRes?.data || prompt);

      // 4. Generate new image for the masked region
      setStep('AI kép generálása...');
      const generated = await jarvis.integrations.Core.GenerateImage({
        prompt: genPrompt,
        existing_image_urls: [file_url],
      });

      // 5. Return result so parent can composite it onto the canvas
      onMaskResult({
        url: generated.url,
        x: Math.min(x, x + w),
        y: Math.min(y, y + h),
        w: Math.abs(w),
        h: Math.abs(h),
        prompt: genPrompt,
      });
      setStep('');
    } catch (err) {
      console.error('[AIMaskPanel]', err?.message);
      setStep('Hiba történt — próbáld újra.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 px-3 py-2 border-b border-border bg-card/80">
      <div className="flex items-center gap-2">
        <Wand2 size={13} className="text-accent shrink-0" />
        <span className="text-xs font-semibold text-foreground">AI Maszk</span>
        {hasMask && (
          <span className="ml-auto text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
            {Math.abs(Math.round(maskRect.w))} × {Math.abs(Math.round(maskRect.h))} px
          </span>
        )}
      </div>

      {!hasMask ? (
        <p className="text-[11px] text-muted-foreground">
          Válaszd az <span className="text-accent font-semibold">AI Maszk</span> eszközt a toolbarból, majd húzz ki egy területet a képen.
        </p>
      ) : (
        <div className="space-y-1.5">
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Mit csináljon az AI ezen a területen? Pl: cseréld ki égboltra, adj hozzá tüzet..."
            className="w-full bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-foreground outline-none resize-none h-16 placeholder:text-muted-foreground"
            disabled={loading}
          />
          <div className="flex gap-1.5">
            <button
              onClick={apply}
              disabled={loading || !prompt.trim()}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-accent text-accent-foreground text-[11px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
              {loading ? step || 'Feldolgozás...' : 'AI alkalmazása'}
            </button>
            <button
              onClick={onClearMask}
              disabled={loading}
              title="Maszk törlése"
              className="px-2.5 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}