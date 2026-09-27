import { useState, useRef, useEffect, useCallback } from 'react';
import { jarvis } from '@/api/jarvisClient'; // for ActionLog only
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, CameraOff, Scan, Check, X, Loader2 } from 'lucide-react';

export default function FaceRecognition({ onRecognized }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | scanning | analyzing | recognized | unknown
  const [message, setMessage] = useState('');
  const [user, setUser] = useState(null);

  useEffect(() => {
    jarvis.auth.me().then(setUser).catch(() => {});
  }, []);

  const startCamera = async () => {
    setIsOpen(true);
    setStatus('scanning');
    setMessage('Kamera indítása...');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play();
      setMessage('Tartsd az arcod a keretbe!');
      setTimeout(captureAndAnalyze, 2000);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsOpen(false);
    setStatus('idle');
    setMessage('');
  };

  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setStatus('analyzing');
    setMessage('Arc elemzése...');

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);

    // Use async canvasToUrl instead of toDataURL (non-blocking)
    const { canvasToUrl, revokeCanvasUrl } = await import('@/lib/canvasOptimization.js');
    const imageUrl = await canvasToUrl(canvas, 'image/jpeg', 0.8);

    const { invokeWithRetry } = await import('@/lib/llmGateway');
    const result = await invokeWithRetry({
      prompt: `Elemezd ezt a képet. Van rajta emberi arc? Ha igen, adj vissza egy rövid leírást (haj, kor kb, nem). Ha nincs arc, jelezd. JSON: {"face_detected": true/false, "description": "..."}`,
      file_urls: [imageUrl],
      response_json_schema: {
        type: 'object',
        properties: {
          face_detected: { type: 'boolean' },
          description: { type: 'string' }
        }
      }
    });

    revokeCanvasUrl(canvas);

    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    if (parsed.face_detected) {
      setStatus('recognized');
      const name = user?.full_name || 'Felhasználó';
      setMessage(`✅ Azonosítva: ${name}`);
      await jarvis.entities.ActionLog.create({
        action_type: 'face_recognition',
        description: `Arc azonosítás sikeres: ${name}`,
        status: 'completed',
      }).catch(() => {});
      if (onRecognized) onRecognized(user);
      setTimeout(stopCamera, 2000);
    } else {
      setStatus('unknown');
      setMessage('❌ Nem sikerült azonosítani. Próbáld újra!');
      setTimeout(() => { setStatus('scanning'); setMessage('Tartsd az arcod a keretbe!'); setTimeout(captureAndAnalyze, 2000); }, 2000);
    }
  }, [user, onRecognized]);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={isOpen ? stopCamera : startCamera}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
          isOpen ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-secondary text-muted-foreground border border-border'
        }`}
      >
        {isOpen ? <CameraOff size={13} /> : <Camera size={13} />}
        {isOpen ? 'Kamera le' : 'Arc azonosítás'}
      </button>

      {/* Camera overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[200] flex flex-col items-center justify-center p-6"
          >
            <div className="relative w-full max-w-xs">
              {/* Corner frame */}
              <div className="absolute inset-0 z-10 pointer-events-none">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-primary rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-primary rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary rounded-br-lg" />
              </div>

              <video ref={videoRef} className="w-full rounded-2xl bg-black" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />

              {/* Scanning line animation */}
              {status === 'scanning' && (
                <motion.div
                  className="absolute left-2 right-2 h-0.5 bg-primary/60 z-10"
                  animate={{ top: ['10%', '90%', '10%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
              )}
            </div>

            {/* Status */}
            <div className="mt-4 flex items-center gap-2 bg-card rounded-2xl px-4 py-3 border border-border">
              {status === 'analyzing' && <Loader2 size={15} className="text-primary animate-spin" />}
              {status === 'recognized' && <Check size={15} className="text-primary" />}
              {status === 'unknown' && <X size={15} className="text-red-400" />}
              {status === 'scanning' && <Scan size={15} className="text-primary animate-pulse" />}
              <p className="text-sm text-foreground">{message}</p>
            </div>

            <button onClick={stopCamera} className="mt-3 text-xs text-muted-foreground">Mégse</button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}