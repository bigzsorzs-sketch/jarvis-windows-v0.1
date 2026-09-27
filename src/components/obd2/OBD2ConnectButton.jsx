import { useState } from 'react';
import { Bluetooth, Loader2, Check, X, AlertCircle } from 'lucide-react';
import OBD2Manager from '@/lib/obd2Manager';
import { motion, AnimatePresence } from 'framer-motion';

export default function OBD2ConnectButton({ onConnected, onError }) {
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState(null); // 'connecting', 'initialized', 'error'
  const [statusMsg, setStatusMsg] = useState('');
  const [manager, setManager] = useState(null);

  const handleConnect = async () => {
    setConnecting(true);
    setStatus('connecting');
    setStatusMsg('Bluetooth kapcsolat...');

    try {
      const obd2 = new OBD2Manager();
      const result = await obd2.connect();

      if (!result.success) {
        throw new Error(result.error);
      }

      if (result.adapterReady !== true) {
        setStatusMsg('Inicializálás...');
        const initResult = await obd2.initialize();
        if (!initResult?.success || initResult.adapterReady !== true) {
          throw new Error(initResult?.error || 'OBD_ADAPTER_NOT_READY');
        }
      }

      setManager(obd2);
      setStatus('initialized');
      setStatusMsg(`✅ Csatlakoztatva: ${result.device}`);
      
      if (onConnected) {
        onConnected(obd2);
      }
    } catch (error) {
      console.error('OBD2 button connect error:', error);
      setStatus('error');
      setStatusMsg('❌ Nem sikerült csatlakozni az eszközhöz.');
      
      if (onError) {
        onError(error);
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (manager) {
      await manager.disconnect();
      setManager(null);
      setStatus(null);
      setStatusMsg('');
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={manager ? handleDisconnect : handleConnect}
        disabled={connecting}
        className={`w-full py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all ${
          manager
            ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        } ${connecting ? 'opacity-50' : ''}`}
      >
        {connecting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Csatlakozás...
          </>
        ) : manager ? (
          <>
            <X size={16} />
            Lecsatlakozás
          </>
        ) : (
          <>
            <Bluetooth size={16} />
            ELM327 csatlakoztatása
          </>
        )}
      </button>

      <AnimatePresence>
        {statusMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`rounded-2xl px-4 py-3 text-sm flex items-start gap-2 ${
              status === 'error'
                ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                : status === 'initialized'
                ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
            }`}
          >
            {status === 'error' ? (
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
            ) : status === 'initialized' ? (
              <Check size={16} className="shrink-0 mt-0.5" />
            ) : (
              <Loader2 size={16} className="shrink-0 mt-0.5 animate-spin" />
            )}
            <span>{statusMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {manager && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl px-4 py-2 text-xs text-green-400">
          ✅ OBD2 Manager aktív - adatokat olvashat
        </div>
      )}
    </div>
  );
}