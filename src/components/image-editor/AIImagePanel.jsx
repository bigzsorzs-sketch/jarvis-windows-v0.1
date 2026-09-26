import { useState, useRef } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { Sparkles, Upload, X, Loader2, ImagePlus, Trash2, AlertCircle } from 'lucide-react';
import { getCachedFileUrl, setCachedFileUrl, getFileSHA256 } from '@/lib/aiFileCache';
import { checkRateLimit, logRequest, getRateLimitWarning } from '@/lib/aiRateLimiter';
import { estimateTokens, estimateImageTokens, formatTokenCount } from '@/lib/tokenCounter';

const MAX_IMAGES = 20;
const MAX_SIZE_MB = 10;

export default function AIImagePanel({ onImageReady, onPromptUsed }) {
  const [images, setImages] = useState([]); // { file, url, uploaded_url, hash }
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');
  const [result, setResult] = useState(null);
  const [tokenEstimate, setTokenEstimate] = useState(0);
  const [rateLimitWarning, setRateLimitWarning] = useState(null);
  const fileRef = useRef(null);

  const handleAddImages = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const remaining = MAX_IMAGES - images.length;
    const toAdd = files.slice(0, remaining).filter(f => f.size <= MAX_SIZE_MB * 1024 * 1024);
    
    const newImages = await Promise.all(toAdd.map(async (f) => ({
      file: f,
      url: URL.createObjectURL(f),
      uploaded_url: null,
      hash: await getFileSHA256(f),
    })));
    setImages(prev => [...prev, ...newImages]);
  };

  const removeImage = (idx) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const clearAll = () => {
    images.forEach(img => URL.revokeObjectURL(img.url));
    setImages([]);
    setResult(null);
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    
    // Check rate limit
    const rateLimit = checkRateLimit();
    if (rateLimit.isLimited) {
      setRateLimitWarning('⚠️ Rate limit elérve, megint később...');
      return;
    }
    if (rateLimit.remaining < 5) {
      setRateLimitWarning(`⚠️ ${rateLimit.remaining}/${rateLimit.total} maradt a percben`);
    }
    
    setLoading(true);
    setResult(null);

    try {
      // 1. Upload images with cache check
      setStep(`Képek feldolgozása (0/${images.length})...`);
      const uploaded = await Promise.all(
        images.map(async (img, i) => {
          if (img.uploaded_url) return img;
          
          // Check cache first
          const cached = img.hash ? getCachedFileUrl(img.hash) : null;
          if (cached) {
            setStep(`Képek feldolgozása (${i + 1}/${images.length})... (cache)`);
            return { ...img, uploaded_url: cached };
          }
          
          const validation = await jarvis.functions.invoke('validateFileUpload', {
            name: img.file.name,
            size: img.file.size,
            type: img.file.type,
          });
          if (validation?.data?.allowed === false) throw new Error('File validation failed');

          const uploadRes = await jarvis.integrations.Core.UploadFile({ file: img.file });
          const file_url = uploadRes?.file_url;
          if (!file_url) throw new Error('Upload failed');
          if (img.hash) setCachedFileUrl(img.hash, file_url);
          setStep(`Képek feltöltése (${i + 1}/${images.length})...`);
          return { ...img, uploaded_url: file_url };
        })
      );
      setImages(uploaded);
      const imageUrls = uploaded.map(img => img.uploaded_url);
      
      // Log request for rate limiting
      logRequest();

      // 2. If references were supplied, let a vision-capable LLM turn the user's
      // natural instruction + images into a strong generation/edit prompt.
      let genPrompt = prompt;
      if (imageUrls.length > 0) {
        setStep('Képek elemzése...');
        const analysisRes = await jarvis.functions.invoke('llmProxy', {
          prompt: `A felhasználó ${images.length} képet töltött fel, és ezt az utasítást adta: "${prompt}"\n\nElemezd a képeket és készíts egy részletes képgenerálási vagy képszerkesztési promptot angolul. Őrizd meg a felhasználó szándékát. Válaszolj csak a prompttal, semmi mással.`,
          file_urls: imageUrls,
          model: 'gemini_3_flash',
        });
        const analysis = analysisRes?.data?.result ?? analysisRes?.data;
        genPrompt = typeof analysis === 'string' ? analysis : (analysis?.result || prompt);
      }

      // 3. Generate/edit image through the configured OpenRouter image model.
      setStep('Kép generálása AI-val...');
      const generated = await jarvis.integrations.Core.GenerateImage({
        prompt: genPrompt,
        existing_image_urls: imageUrls.slice(0, 5), // max 5 reference images
      });

      setResult(generated.url);
      setStep('');
      if (onPromptUsed) onPromptUsed(genPrompt, imageUrls.length);
    } catch (err) {
      console.error('[AIImagePanel]', err?.message);
      if (String(err?.message || '').includes('OPENROUTER_API_KEY_REQUIRED')) {
        setStep('Hiányzik az OpenRouter API kulcs. Add meg a Beállításokban.');
      } else {
        setStep('Hiba történt — próbáld újra.');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadToCanvas = () => {
    if (result && onImageReady) onImageReady(result);
  };

  return (
    <div className="w-72 bg-card border-l border-border flex flex-col shrink-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Sparkles size={14} className="text-primary" />
        <span className="text-xs font-semibold text-foreground">AI Képgenerátor</span>
      </div>

      {/* Image grid */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <div className="grid grid-cols-3 gap-1.5">
          {images.map((img, i) => (
            <div key={i} className="relative group aspect-square rounded overflow-hidden bg-secondary">
              <img src={img.url} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(i)}
                className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={10} className="text-white" />
              </button>
            </div>
          ))}
          {images.length < MAX_IMAGES && (
            <button
              onClick={() => fileRef.current?.click()}
              className="aspect-square rounded border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors"
            >
              <Upload size={14} />
              <span className="text-[9px] mt-0.5">{images.length}/{MAX_IMAGES}</span>
            </button>
          )}
        </div>

        {images.length > 0 && (
          <button onClick={clearAll} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
            <Trash2 size={10} /> Összes törlése
          </button>
        )}

        {/* Token estimate */}
        {prompt && (
          <div className="text-[10px] text-muted-foreground">
            📊 Becsült tokenek: <span className="text-accent font-semibold">{formatTokenCount(estimateTokens(prompt, 'hu') + images.reduce((a, img) => a + estimateImageTokens(1200, 800), 0))}</span>
          </div>
        )}

        {/* Prompt */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Utasítás:</label>
          <textarea
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value); setRateLimitWarning(null); }}
            placeholder="Pl: Készíts egy kollázsot ezekből a képekből, retro stílusban..."
            className="w-full bg-secondary rounded-lg px-2.5 py-2 text-xs text-foreground border border-border outline-none resize-none h-20 placeholder:text-muted-foreground"
          />
        </div>

        <button
          onClick={generate}
          disabled={loading || !prompt.trim()}
          className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition-opacity"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {loading ? 'Generálás...' : (images.length ? 'Kép szerkesztése / generálása' : 'Kép generálása')}
        </button>



        {rateLimitWarning && (
          <div className="flex items-center gap-1.5 bg-destructive/10 border border-destructive/30 rounded-lg px-2.5 py-1.5">
            <AlertCircle size={12} className="text-destructive shrink-0" />
            <p className="text-[10px] text-destructive">{rateLimitWarning}</p>
          </div>
        )}

        {step && <p className="text-xs text-muted-foreground">{step}</p>}

        {/* Result */}
        {result && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-primary">Eredmény:</p>
            <img src={result} alt="Generated" className="w-full rounded-lg border border-border" />
            <button
              onClick={loadToCanvas}
              className="w-full py-2 rounded-lg bg-accent text-accent-foreground text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <ImagePlus size={14} /> Betöltés a vászonra
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleAddImages}
      />
    </div>
  );
}