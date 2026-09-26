import { useRef, useState } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { Paperclip, ImageIcon, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MAX_IMAGES = 10;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Reusable multi-image upload component.
 * Props:
 *   images: [{ url, name }]  – current list
 *   onChange: (images) => void – called with new list
 *   onError: (msg) => void – optional error callback
 */
export default function MultiImageUpload({ images = [], onChange, onError }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      onError?.(`❌ Maximum ${MAX_IMAGES} képet tölthetsz fel.`);
      return;
    }

    const toUpload = files.slice(0, remaining);
    setUploading(true);

    const newImages = [...images];
    for (const file of toUpload) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        onError?.(`❌ ${file.name}: Csak JPG, PNG, WebP, GIF támogatott.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        onError?.(`❌ ${file.name}: Max 5MB lehet.`);
        continue;
      }
      try {
        const response = await jarvis.functions.invoke('validateFileUpload', { file });
        if (response.data?.success) {
          newImages.push({ url: response.data.file_url, name: response.data.filename });
        } else {
          onError?.(`❌ ${response.data?.error || 'Fájl validáció sikertelen'}`);
        }
      } catch (err) {
        onError?.(`❌ Feltöltési hiba: ${err?.message || 'Ismeretlen hiba'}`);
      }
    }

    onChange(newImages);
    setUploading(false);
    e.target.value = '';
  };

  const remove = (idx) => {
    onChange(images.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="text-muted-foreground shrink-0 hover:text-foreground transition-colors"
        title={`Képek csatolása (max ${MAX_IMAGES})`}
        disabled={uploading || images.length >= MAX_IMAGES}
      >
        {uploading
          ? <Loader2 size={17} className="animate-spin text-primary" />
          : <Paperclip size={17} />
        }
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />

      {/* Preview strip */}
      <AnimatePresence>
        {images.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-1.5 px-1 py-1"
          >
            {images.map((img, i) => (
              <div key={i} className="flex items-center gap-1 bg-secondary rounded-lg px-2 py-1">
                <ImageIcon size={11} className="text-primary shrink-0" />
                <span className="text-xs text-foreground max-w-[70px] truncate">{img.name}</span>
                <button type="button" onClick={() => remove(i)}>
                  <X size={11} className="text-muted-foreground hover:text-destructive transition-colors" />
                </button>
              </div>
            ))}
            <span className="text-xs text-muted-foreground self-center">{images.length}/{MAX_IMAGES}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}