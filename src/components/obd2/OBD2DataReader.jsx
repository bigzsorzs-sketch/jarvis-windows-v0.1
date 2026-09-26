import { useState, useEffect } from 'react';
import { Loader2, Gauge, Thermometer, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import OBD2VisualDataPanel from '@/components/obd2/OBD2VisualDataPanel';

const PID_CONFIGS = {
  ENGINE_RPM: { icon: Gauge, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  COOLANT_TEMP: { icon: Thermometer, color: 'text-red-400', bg: 'bg-red-500/10' },
  MAF_AIR_FLOW: { icon: Gauge, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  SPEED: { icon: Gauge, color: 'text-green-400', bg: 'bg-green-500/10' },
};

export default function OBD2DataReader({ manager, autoRead = true }) {
  const [readings, setReadings] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dtcCodes, setDtcCodes] = useState([]);

  const readAllData = async () => {
    if (!manager) return;
    
    setLoading(true);
    setError(null);
    const newReadings = {};

    try {
      // PIDs olvasása
      for (const pidKey of Object.keys(PID_CONFIGS)) {
        try {
          const data = await manager.readPID(pidKey);
          if (data) {
            newReadings[pidKey] = data;
          }
        } catch (err) {
          console.warn(`PID hiba (${pidKey}):`, err);
        }
      }

      // DTC kódok olvasása
      try {
        const codes = await manager.readDTCs();
        setDtcCodes(codes);
      } catch (err) {
        console.warn('DTC olvasási hiba:', err);
      }

      setReadings(newReadings);
      setHistory(prev => [...prev, {
        time: new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        rpm: newReadings.ENGINE_RPM?.value,
        temperature: newReadings.COOLANT_TEMP?.value,
        maf: newReadings.MAF_AIR_FLOW?.value,
        speed: newReadings.SPEED?.value,
      }].slice(-30));
    } catch (err) {
      console.error('OBD2 read error:', err);
      setError('Az adatokat most nem tudtuk beolvasni. Próbáld meg újra.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-read 5 másodpercenként
  useEffect(() => {
    if (!manager || !autoRead) return;

    readAllData();
    const interval = setInterval(readAllData, 5000);
    return () => clearInterval(interval);
  }, [manager, autoRead]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 justify-between">
        <h2 className="text-sm font-semibold text-foreground">Live OBD2 Adatok</h2>
        <button
          onClick={readAllData}
          disabled={!manager || loading}
          className="px-3 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/30 disabled:opacity-40 transition-all flex items-center gap-1"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : '🔄'}
          Frissítés
        </button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400 flex items-start gap-2"
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Olvasások */}
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(readings).map(([pidKey, data]) => {
          const config = PID_CONFIGS[pidKey];
          const Icon = config?.icon || Gauge;

          return (
            <motion.div
              key={pidKey}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`rounded-lg p-3 border border-border ${config?.bg || 'bg-secondary'}`}
            >
              <div className="flex items-start gap-2 mb-2">
                <Icon size={14} className={config?.color || 'text-muted-foreground'} />
                <span className="text-xs text-muted-foreground">{data.name}</span>
              </div>
              <div className="text-xl font-bold text-foreground">
                {typeof data.value === 'number' ? data.value.toFixed(1) : data.value}
              </div>
              <div className="text-xs text-muted-foreground">{data.unit}</div>
            </motion.div>
          );
        })}
      </div>

      <OBD2VisualDataPanel readings={readings} history={history} dtcCodes={dtcCodes} />

      {/* DTC Kódok */}
      {dtcCodes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4"
        >
          <h3 className="text-sm font-semibold text-orange-400 mb-2">⚠️ Hibakódok ({dtcCodes.length})</h3>
          <div className="space-y-1">
            {dtcCodes.map(code => (
              <div key={code} className="flex items-center gap-2 text-xs text-orange-400">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                <span className="font-mono">{code}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {!manager && (
        <div className="bg-muted/30 rounded-lg p-4 text-center text-xs text-muted-foreground">
          Csatlakozz egy OBD2 olvasóhoz az adatok megjelenítéséhez
        </div>
      )}
    </div>
  );
}