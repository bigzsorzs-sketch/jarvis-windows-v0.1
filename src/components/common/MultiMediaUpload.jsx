import { useRef, useState, useCallback } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { Paperclip, ImageIcon, Film, Music, FileText, Archive, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MAX_FILES = 10;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // Match Electron file validator and FileReader guard
const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // Avoid excessive base64 in the renderer and IPC
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
export default function MultiMediaUpload({ files = [], onChange, onError, buttonOnly = false }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFiles = useCallback(async (e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;

    const remaining = MAX_FILES - files.length;
    if (remaining <= 0) {
      onError?.(`❌ Maximum ${MAX_FILES} fájlt tölthetsz fel.`);
      e.target.value = '';
      return;
    }

    const toUpload = selected.slice(0, remaining);
    const totalSelectedSize = toUpload.reduce((sum, file) => sum + (file.size || 0), 0);
    const alreadySelectedSize = files.reduce((sum, entry) => sum + (Number(entry?.size) || 0), 0);
    if (alreadySelectedSize + totalSelectedSize > MAX_TOTAL_SIZE) {
      onError?.('❌ A csatolmányok összmérete legfeljebb 25 MB lehet.');
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
      if (file.size > MAX_FILE_SIZE) {
        onError?.(`❌ ${file.name}: Egy fájl legfeljebb 25 MB lehet.`);
        continue;
      }
      try {
        const uploaded = await uploadWithRetry(file);
        const fileUrl = uploaded?.file_url;
        if (!fileUrl) throw new Error('No file_url in response');
        newFiles.push({ url: fileUrl, name: file.name, type: file.type, kind, size: file.size });
      } catch (error) {
        console.error('Upload failed:', file.name, error?.response?.data || error?.message || error);
        onError?.(`❌ Feltöltési hiba: ${file.name} – ${getUploadErrorMessage(error)}`);
      }
    }

    onChange(newFiles);
    setUploading(false);
    e.target.value = '';
  }, [files, onChange, onError]);

  const remove = useCallback((idx) => onChange(files.filter((_, i) => i !== idx)), [files, onChange]);

  if (buttonOnly) {
    return (
      <>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-muted-foreground shrink-0 hover:text-foreground transition-colors relative"
          title={`Fájl csatolása – kép, videó, hang, dokumentum, kód, archív (max 25 MB összesen)`}
          disabled={uploading || files.length >= MAX_FILES}
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
            <span className="text-xs text-muted-foreground self-center">{files.length}/{MAX_FILES}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}