import { useRef, useState, useCallback } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { Paperclip, ImageIcon, Film, Music, FileText, Archive, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MAX_FILES = 10;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // Match Electron file validator and FileReader guard
const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // Avoid excessive base64 in the renderer and IPC

// Conversation upload profile: up to 20 attachments and 1 GiB of original
// selected data. Large raster images are normalized before the existing
// 25 MiB IPC/data-URL validator so a large photo cannot explode renderer memory.
const CHAT_MAX_FILES = 20;
const CHAT_MAX_TOTAL_SIZE = 1024 * 1024 * 1024;
const CHAT_MAX_IMAGE_SOURCE_SIZE = 100 * 1024 * 1024;
const CHAT_IMAGE_TARGET_BYTES = 4 * 1024 * 1024;
const CHAT_IMAGE_MAX_EDGE = 2560;
const OPTIMIZABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/bmp']);

const SAFE_FILE_NAME = /^[\w\-. ()\[\]]+$/;

const FILE_TYPES = {
  image: { accept: 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml,.jpg,.jpeg,.png,.webp,.gif,.svg', icon: ImageIcon, color: 'text-primary', label: 'kép' },
  video: { accept: 'video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.webm,.mov,.avi,.mkv', icon: Film, color: 'text-blue-400', label: 'videó' },
  audio: { accept: 'audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/mp4,audio/m4a,audio/aac,audio/flac,.mp3,.wav,.ogg,.webm,.m4a,.aac,.flac', icon: Music, color: 'text-green-400', label: 'hang' },
  document: { accept: 'application/pdf,text/plain,text/csv,application/json,application/rtf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pdf,.txt,.csv,.json,.rtf,.doc,.docx,.xls,.xlsx,.ppt,.pptx', icon: FileText, color: 'text-yellow-400', label: 'dokumentum' },
  code: { accept: 'text/javascript,application/javascript,text/typescript,text/css,text/html,text/markdown,application/xml,text/xml,text/x-python,text/x-java-source,text/x-c,text/x-c++,text/x-shellscript,.js,.jsx,.ts,.tsx,.css,.scss,.html,.htm,.md,.yml,.yaml,.xml,.sql,.sh,.py,.java,.c,.cpp,.cs,.php,.rb,.go,.rs,.vue,.svelte', icon: FileText, color: 'text-cyan-400', label: 'kód' },
  archive: { accept: 'application/zip,application/x-zip,application/x-zip-compressed,application/x-compressed,multipart/x-zip,application/x-rar-compressed,application/x-7z-compressed,application/gzip,.zip,.rar,.7z,.gz', icon: Archive, color: 'text-orange-400', label: 'archív' },
};

const ALL_ACCEPT = Object.values(FILE_TYPES).map(t => t.accept).join(',');

function getFileKind(mimeType, fileName = '') {
  const type = String(mimeType || '').toLowerCase();
  const ext = String(fileName || '').toLowerCase().split('.').pop();
  if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) return 'image';
  if (type.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
  if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) return 'audio';
  if (['js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'html', 'htm', 'md', 'yml', 'yaml', 'xml', 'sql', 'sh', 'py', 'java', 'c', 'cpp', 'cs', 'php', 'rb', 'go', 'rs', 'vue', 'svelte'].includes(ext)) return 'code';
  if (['pdf', 'txt', 'csv', 'json', 'rtf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'document';
  if (['zip', 'rar', '7z', 'gz'].includes(ext)) return 'archive';
  return null;
}

function getUploadErrorMessage(error) {
  const status = error?.response?.status;
  const details = error?.response?.data?.error || error?.response?.data?.message || error?.message;
  if (status === 413) return 'A fájl túl nagy ehhez a feltöltéshez.';
  if (status === 415) return 'Ezt a fájltípust a feltöltés nem fogadta el.';
  if (status === 401 || status === 403) return 'A feltöltéshez újra be kell jelentkezni.';
  return details || 'Ismeretlen feltöltési hiba.';
}

function formatLimit(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('IMAGE_OPTIMIZATION_FAILED'));
    }, type, quality);
  });
}

async function optimizeChatImage(file) {
  if (!file || file.size <= CHAT_IMAGE_TARGET_BYTES) return file;
  if (!OPTIMIZABLE_IMAGE_TYPES.has(String(file.type || '').toLowerCase())) {
    if (file.size <= MAX_FILE_SIZE) return file;
    throw new Error('A nagy GIF/SVG képeket előbb JPG, PNG vagy WebP formátumba kell menteni.');
  }
  if (typeof createImageBitmap !== 'function') {
    if (file.size <= MAX_FILE_SIZE) return file;
    throw new Error('A nagy kép optimalizálása ezen a rendszeren nem érhető el.');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height) || 1;
    let scale = Math.min(1, CHAT_IMAGE_MAX_EDGE / longest);
    let quality = 0.9;
    let blob = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d', { alpha:false });
      if (!context) throw new Error('IMAGE_OPTIMIZATION_CONTEXT_FAILED');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await canvasToBlob(canvas, 'image/webp', quality);
      if (blob.size <= CHAT_IMAGE_TARGET_BYTES) break;
      scale *= 0.82;
      quality = Math.max(0.62, quality - 0.08);
    }

    if (!blob || blob.size > MAX_FILE_SIZE) throw new Error('IMAGE_OPTIMIZATION_TOO_LARGE');
    const baseName = String(file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${baseName}.webp`, {
      type:'image/webp',
      lastModified:file.lastModified || Date.now(),
    });
  } finally {
    bitmap.close?.();
  }
}

async function uploadWithRetry(file) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await jarvis.integrations.Core.UploadFile({ file });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

function FileChip({ file, onRemove }) {
  const kind = getFileKind(file.type || '', file.name);
  const cfg = FILE_TYPES[kind] || FILE_TYPES.image;
  const Icon = cfg.icon;
  return (
    <div className="flex items-center gap-1 bg-secondary rounded-lg px-2 py-1">
      <Icon size={11} className={`${cfg.color} shrink-0`} />
      <span className="text-xs text-foreground max-w-[80px] truncate">{file.name}</span>
      <button type="button" onClick={onRemove}>
        <X size={11} className="text-muted-foreground hover:text-destructive transition-colors" />
      </button>
    </div>
  );
}

/**
 * Reusable multi-file upload: images, video, audio.
 * Props:
 *   files: [{ url, name, type, kind }]
 *   onChange: (files) => void
 *   onError: (msg) => void
 */
export default function MultiMediaUpload({ files = [], onChange, onError, buttonOnly = false, chatMode = false }) {
  const [uploading, setUploading] = useState(false);
  const effectiveMaxFiles = chatMode ? CHAT_MAX_FILES : MAX_FILES;
  const effectiveMaxTotalSize = chatMode ? CHAT_MAX_TOTAL_SIZE : MAX_TOTAL_SIZE;
  const effectiveMaxFileSize = MAX_FILE_SIZE;
  const fileInputRef = useRef(null);

  const handleFiles = useCallback(async (e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;

    const remaining = effectiveMaxFiles - files.length;
    if (remaining <= 0) {
      onError?.(`❌ Maximum ${effectiveMaxFiles} fájlt tölthetsz fel.`);
      e.target.value = '';
      return;
    }

    const toUpload = selected.slice(0, remaining);
    const totalSelectedSize = toUpload.reduce((sum, file) => sum + (file.size || 0), 0);
    const alreadySelectedSize = files.reduce((sum, entry) => sum + (Number(entry?.size) || 0), 0);
    if (alreadySelectedSize + totalSelectedSize > effectiveMaxTotalSize) {
      onError?.(`❌ A csatolmányok összmérete legfeljebb ${formatLimit(effectiveMaxTotalSize)} lehet.`);
      e.target.value = '';
      return;
    }
    setUploading(true);

    const newFiles = [...files];
    for (const file of toUpload) {
      const kind = getFileKind(file.type, file.name);
      if (!kind) {
        onError?.(`❌ ${file.name}: Nem támogatott fájltípus.`);
        continue;
      }
      if (!SAFE_FILE_NAME.test(file.name) || file.name.length > 120) {
        onError?.(`❌ ${file.name}: Nem biztonságos fájlnév.`);
        continue;
      }
      const sourceLimit = chatMode && kind === 'image' ? CHAT_MAX_IMAGE_SOURCE_SIZE : effectiveMaxFileSize;
      if (file.size > sourceLimit) {
        onError?.(`❌ ${file.name}: Egy ${kind === 'image' ? 'kép' : 'fájl'} legfeljebb ${formatLimit(sourceLimit)} lehet.`);
        continue;
      }
      try {
        const uploadFile = chatMode && kind === 'image' ? await optimizeChatImage(file) : file;
        const uploaded = await uploadWithRetry(uploadFile);
        const fileUrl = uploaded?.file_url;
        if (!fileUrl) throw new Error('No file_url in response');
        newFiles.push({ url: fileUrl, name: file.name, type: uploadFile.type || file.type, kind, size: file.size, uploadSize: uploadFile.size });
      } catch (error) {
        console.error('Upload failed:', file.name, error?.response?.data || error?.message || error);
        onError?.(`❌ Feltöltési hiba: ${file.name} – ${getUploadErrorMessage(error)}`);
      }
    }

    onChange(newFiles);
    setUploading(false);
    e.target.value = '';
  }, [files, onChange, onError, chatMode, effectiveMaxFiles, effectiveMaxTotalSize, effectiveMaxFileSize]);

  const remove = useCallback((idx) => onChange(files.filter((_, i) => i !== idx)), [files, onChange]);

  if (buttonOnly) {
    return (
      <>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-muted-foreground shrink-0 hover:text-foreground transition-colors relative"
          title={`Fájl csatolása – kép, videó, hang, dokumentum, kód, archív (max ${effectiveMaxFiles} fájl, ${formatLimit(effectiveMaxTotalSize)} összesen)`}
          disabled={uploading || files.length >= effectiveMaxFiles}
        >
          {uploading
            ? <Loader2 size={17} className="animate-spin text-primary" />
            : <Paperclip size={17} />
          }
          {files.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">
              {files.length}
            </span>
          )}
        </button>
        <input ref={fileInputRef} type="file" accept={ALL_ACCEPT} multiple className="hidden" onChange={handleFiles} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={fileInputRef}
        type="file"
        accept={ALL_ACCEPT}
        multiple
        className="hidden"
        onChange={handleFiles}
      />

      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-1.5 px-1 py-1"
          >
            {files.map((f, i) => (
              <FileChip key={i} file={f} onRemove={() => remove(i)} />
            ))}
            <span className="text-xs text-muted-foreground self-center">{files.length}/{effectiveMaxFiles}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}