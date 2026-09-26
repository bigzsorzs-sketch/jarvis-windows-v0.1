import { useState, useEffect, useRef } from 'react';
import { jarvis } from '@/api/jarvisClient';
import GlucoSensorManager from '@/lib/glucoseSensors/GlucoSensorManager';
import { Droplet, Bluetooth, Loader2, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '@/lib/logger';

export default function GlucoSensorConnector() {
  const [sensorManager] = useState(() => new GlucoSensorManager());
  const [isConnected, setIsConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sensorInfo, setSensorInfo] = useState(null);
  const [lastReading, setLastReading] = useState(null);
  const [status, setStatus] = useState('');
  const [experimentalDirectBluetooth, setExperimentalDirectBluetooth] = useState(false);
  const autoSaveRef = useRef(true);

  // Cleanup: disconnect sensor on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      sensorManager.disconnect().catch(() => {});
    };
  }, [sensorManager]);

  const connectSensor = async () => {
    setConnecting(true);
    setStatus('Szenzor keresése...');

    try {
      const result = await sensorManager.detectAndConnect({ allowExperimental: experimentalDirectBluetooth });

      if (!result.success) throw new Error(result.error);

      setStatus(`✅ ${result.sensor} csatlakoztatva!`);
      setSensorInfo(result);
      setIsConnected(true);

      // Auto-read indítása
      await sensorManager.startAutoRead((reading) => {
        setLastReading(reading);

        // Automatikus tárolás
        if (autoSaveRef.current) {
          saveReading(reading);
        }
      });

      setConnecting(false);
    } catch (error) {
      logger.error('GlucoSensorConnector', 'Glucose sensor connection failed');
      setStatus('❌ A szenzorhoz most nem tudtunk csatlakozni.');
      setConnecting(false);
    }
  };

  const disconnectSensor = async () => {
    await sensorManager.disconnect();
    setIsConnected(false);
    setSensorInfo(null);
    setLastReading(null);
    setStatus('Szenzor lecsatlakoztatva');
  };

  const saveReading = async (reading) => {
    try {
      const currentUser = await jarvis.auth.me();
      if (!currentUser?.email) return;

      await jarvis.entities.BloodSugar.create({
        value: reading.glucose,
        unit: 'mmol/L',
        time_of_day: getTimeOfDay(),
        note: `${reading.sensor} - ${reading.trend > 0 ? '↑' : reading.trend < 0 ? '↓' : '→'}`,
        date: reading.date,
        created_by: currentUser.email
      });

      logger.info('GlucoSensorConnector', 'Blood sugar reading saved');

      // Speak notification
      if ('speechSynthesis' in window) {
        const msg = new SpeechSynthesisUtterance(
          `Vércukor: ${reading.glucose.toFixed(1)} millimól per liter`
        );
        msg.lang = 'hu-HU';
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(msg);
      }
    } catch (error) {
      logger.error('GlucoSensorConnector', 'Blood sugar save failed');
    }
  };

  const getTimeOfDay = () => {
    const h = new Date().getHours();
    if (h < 5) return 'éjszaka';
    if (h < 10) return 'reggel';
    if (h < 14) return 'ebéd';
    if (h < 17) return 'délután';
    if (h < 20) return 'vacsora';
    return 'este';
  };

  const getTrendIcon = (trend) => {
    if (trend > 1) return <TrendingUp className="text-red-400" size={16} />;
    if (trend === 1) return <TrendingUp className="text-yellow-400" size={16} />;
    if (trend === 0) return <Zap className="text-green-400" size={16} />;
    if (trend === -1) return <TrendingDown className="text-yellow-400" size={16} />;
    return <TrendingDown className="text-red-400" size={16} />;
  };

  const getTrendColor = (glucose) => {
    if (glucose < 3.9) return 'text-red-500';
    if (glucose < 5.5) return 'text-green-500';
    if (glucose < 7) return 'text-yellow-500';
    if (glucose < 10) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-2xl p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-2xl bg-red-500/20 flex items-center justify-center">
          <Droplet size={20} className="text-red-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground">Vércukor szenzor</h2>
          <p className="text-xs text-muted-foreground">Provider API / helyi előzmény; közvetlen Bluetooth csak kísérleti módban</p>
        </div>
        {isConnected && (
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        )}
      </div>

      {/* Status */}
      <AnimatePresence>
        {status && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`text-xs px-3 py-2 rounded-xl ${
              status.includes('✅')
                ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                : status.includes('❌')
                ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
            }`}
          >
            {status}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Last Reading Display */}
      {lastReading && (
        <div className="bg-secondary rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Utolsó mérés</span>
            <span className="text-xs text-muted-foreground">
              {new Date(lastReading.timestamp).toLocaleTimeString('hu-HU')}
            </span>
          </div>
          <div className="flex items-end gap-3">
            <div className={`text-3xl font-bold ${getTrendColor(lastReading.glucose)}`}>
              {lastReading.glucose.toFixed(1)}
            </div>
            <div className="flex flex-col gap-1 mb-1">
              <span className="text-xs text-muted-foreground">mmol/L</span>
              {getTrendIcon(lastReading.trend)}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">📡 {lastReading.sensor}</p>
        </div>
      )}

      {/* Auto-save toggle */}
      {isConnected && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            defaultChecked={true}
            onChange={(e) => (autoSaveRef.current = e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-xs text-muted-foreground">Automatikus mentés BloodSugar táblázatba</span>
        </label>
      )}

      {!isConnected && (
        <label className="flex items-start gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
          <input
            type="checkbox"
            checked={experimentalDirectBluetooth}
            onChange={(e) => setExperimentalDirectBluetooth(e.target.checked)}
            className="mt-0.5 w-4 h-4"
          />
          <span className="text-xs text-yellow-300">
            Kísérleti közvetlen Bluetooth engedélyezése. Ez nem hivatalos Libre/Dexcom provider-integráció és nem része az éles kompatibilitási ígéretnek.
          </span>
        </label>
      )}

      {/* Connect/Disconnect Button */}
      <button
        onClick={isConnected ? disconnectSensor : connectSensor}
        disabled={connecting || (!isConnected && !experimentalDirectBluetooth)}
        className={`w-full py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
          isConnected
            ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
            : 'bg-green-500 text-white hover:bg-green-600'
        } ${connecting ? 'opacity-60' : ''}`}
      >
        {connecting ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Keresés...
          </>
        ) : isConnected ? (
          <>
            <Bluetooth size={14} />
            Szenzor lecsatlakoztatása
          </>
        ) : (
          <>
            <Bluetooth size={14} />
            Szenzor csatlakoztatása
          </>
        )}
      </button>

      {/* Info */}
      <div className="bg-primary/10 border border-primary/30 rounded-xl p-3">
        <p className="text-xs text-primary font-semibold mb-1">✨ Automatikus folyamat</p>
        <ul className="text-xs text-muted-foreground space-y-0.5">
          <li>• Szenzor csatlakoztatásakor azonnal elkezdi az olvasást</li>
          <li>• 1-5 percenként frissít (szenzortípustól függően)</li>
          <li>• Szóbeli értesítés minden méréskor</li>
          <li>• Automatikus tárolás az adatbázisban</li>
        </ul>
      </div>
    </motion.div>
  );
}