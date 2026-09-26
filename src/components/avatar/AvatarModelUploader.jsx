import { useRef, useState } from 'react';
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { jarvis } from '@/api/jarvisClient';

export default function AvatarModelUploader({ onModelReady }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('GLB modell feltöltése');

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isGlb = file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf');
    if (!isGlb) {
      setStatus('error');
      setMessage('Csak GLB vagy GLTF fájl használható.');
      return;
    }

    const localUrl = URL.createObjectURL(file);
    onModelReady(localUrl);
    setStatus('loading');
    setMessage('Modell betöltve, mentés folyamatban...');

    const uploaded = await jarvis.integrations.Core.UploadFile({ file });
    if (uploaded?.file_url) {
      localStorage.setItem('liveAssistantAvatarUrl', uploaded.file_url);
      onModelReady(uploaded.file_url);
      setStatus('success');
      setMessage('GLB avatar aktív');
    }
  };

  return (
    <div className="mx-auto w-full max-w-sm">
      <input
        ref={inputRef}
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-2xl border border-border bg-background/70 px-4 py-2.5 text-xs font-semibold text-foreground backdrop-blur flex items-center justify-center gap-2"
      >
        {status === 'success' ? <CheckCircle2 size={15} className="text-primary" /> : status === 'error' ? <AlertCircle size={15} className="text-destructive" /> : <Upload size={15} />}
        {message}
      </button>
    </div>
  );
}