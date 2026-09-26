import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar } from 'recharts';
import { Gauge, Thermometer, Wind, AlertTriangle, Trash2, X, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseOBD2Response, handleOBD2Error, OBD2_ERROR_MESSAGES } from '@/lib/obd2ErrorHandler';
import OBD2WidgetDashboard from './OBD2WidgetDashboard';

export default function OBD2Dashboard({ obd2Manager, isConnected }) {
  const [showWidgets, setShowWidgets] = useState(false);
  const [data, setData] = useState([]);
  const [dtcCodes, setDtcCodes] = useState([]);
  const [currentValues, setCurrentValues] = useState({
    rpm: 0,
    temperature: 0,
    maf: 0,
    timestamp: new Date().getTime(),
  });
  const [pendingClear, setPendingClear] = useState(null);

  // Read DTCs on mount
  useEffect(() => {
    if (!obd2Manager || !isConnected) return;
    
    const readDTCs = async () => {
      try {
        const codes = await obd2Manager.readDTCs?.() || [];
        setDtcCodes(codes);
      } catch (error) {
        console.error('DTC read error:', error);
      }
    };

    readDTCs();
  }, [obd2Manager, isConnected]);

  useEffect(() => {
    if (!obd2Manager || !isConnected) return;

    let lastUpdate = Date.now();
    const THROTTLE_MS = 500; // Throttle to 500ms (2x per second)
    const pollInterval = setInterval(async () => {
      try {
        const now = Date.now();
        if (now - lastUpdate < THROTTLE_MS) return;
        lastUpdate = now;

        // Parallel PID reads for efficiency
        const [rpmData, tempData, mafData] = await Promise.all([
          obd2Manager.readPID('010C'),
          obd2Manager.readPID('0105'),
          obd2Manager.readPID('0110')
        ]);

        let rpm = 0, temperature = 0, maf = 0;
        
        const rpmParsed = parseOBD2Response(rpmData);
        const tempParsed = parseOBD2Response(tempData);
        const mafParsed = parseOBD2Response(mafData);
        
        if (rpmParsed.success) {
          const a = parseInt(rpmParsed.data.substring(0, 2), 16);
          const b = parseInt(rpmParsed.data.substring(2, 4), 16);
          rpm = ((a * 256 + b) / 4).toFixed(0);
        }
        if (tempParsed.success) {
          const a = parseInt(tempParsed.data.substring(0, 2), 16);
          temperature = (a - 40).toFixed(1);
        }
        if (mafParsed.success) {
          const a = parseInt(mafParsed.data.substring(0, 2), 16);
          const b = parseInt(mafParsed.data.substring(2, 4), 16);
          maf = ((a * 256 + b) / 100).toFixed(2);
        }

        setCurrentValues({ rpm, temperature, maf, timestamp: now });
        setData(prev => [...prev, { rpm, temperature, maf, time: new Date().toLocaleTimeString('hu-HU') }].slice(-30));
      } catch (error) {
        const errorInfo = handleOBD2Error(error);
        console.error('OBD2 read error:', errorInfo);
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [obd2Manager, isConnected]);

  const handleClearDTC = async (dtcCode) => {
    try {
      await obd2Manager.clearDTC?.(dtcCode);
      setDtcCodes(prev => prev.filter(c => c !== dtcCode));
      setPendingClear(null);
    } catch (error) {
      console.error('DTC clear error:', error);
    }
  };

  if (!isConnected || data.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-card border border-border rounded-2xl p-6 text-center text-muted-foreground">
          <Wind size={32} className="mx-auto opacity-30 mb-3" />
          <p className="text-sm">Csatlakozz OBD2-hez az adatok megtekintéséhez...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Widget toggle */}
      <button
        onClick={() => setShowWidgets(!showWidgets)}
        className={`w-full py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
          showWidgets
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-foreground hover:bg-muted'
        }`}
      >
        <Settings size={14} />
        {showWidgets ? '📊 Testreszabható műszerek' : '🎛️ Testreszabható műszerek megnyitása'}
      </button>

      {/* Widget dashboard */}
      {showWidgets && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          <OBD2WidgetDashboard obd2Manager={obd2Manager} isConnected={isConnected} />
        </motion.div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <div className="flex justify-center mb-2">
            <Gauge size={18} className="text-yellow-400" />
          </div>
          <p className="text-xs text-muted-foreground">RPM</p>
          <p className="text-2xl font-bold text-foreground">{currentValues.rpm}</p>
          <p className="text-xs text-muted-foreground mt-1">ford./perc</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <div className="flex justify-center mb-2">
            <Thermometer size={18} className="text-red-400" />
          </div>
          <p className="text-xs text-muted-foreground">Motor</p>
          <p className="text-2xl font-bold text-foreground">{currentValues.temperature}°C</p>
          <p className="text-xs text-muted-foreground mt-1">hőmérséklet</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <div className="flex justify-center mb-2">
            <Wind size={18} className="text-blue-400" />
          </div>
          <p className="text-xs text-muted-foreground">MAF</p>
          <p className="text-2xl font-bold text-foreground">{currentValues.maf}</p>
          <p className="text-xs text-muted-foreground mt-1">g/s</p>
        </div>
      </div>

      {/* RPM Chart */}
      <div className="bg-card border border-border rounded-2xl p-4 overflow-hidden">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Gauge size={14} className="text-yellow-400" />
          RPM Trend
        </h3>
        <div className="w-full overflow-hidden">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9 }} width={40} />
              <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', fontSize: 11 }} />
              <Line type="monotone" dataKey="rpm" stroke="#facc15" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Temperature Chart */}
      <div className="bg-card border border-border rounded-2xl p-4 overflow-hidden">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Thermometer size={14} className="text-red-400" />
          Motorhőmérséklet
        </h3>
        <div className="w-full overflow-hidden">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9 }} domain={[0, 120]} width={40} />
              <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', fontSize: 11 }} />
              <Line type="monotone" dataKey="temperature" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* MAF Chart */}
      <div className="bg-card border border-border rounded-2xl p-4 overflow-hidden">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Wind size={14} className="text-blue-400" />
          MAF szenzor (légtömeg)
        </h3>
        <div className="w-full overflow-hidden">
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9 }} width={40} />
              <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', fontSize: 11 }} />
              <Bar dataKey="maf" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DTCs Section */}
      {dtcCodes.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-red-400" />
            <h3 className="text-sm font-semibold text-red-400">
              Hibakódok ({dtcCodes.length})
            </h3>
          </div>
          <div className="space-y-2">
            {dtcCodes.map((code, idx) => (
              <div key={idx} className="flex items-center justify-between bg-card rounded-xl p-3 border border-red-500/20">
                <span className="text-sm font-mono text-foreground">{code}</span>
                <button
                  onClick={() => setPendingClear(code)}
                  className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 size={12} />
                  Törlés
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-muted-foreground bg-card border border-border rounded-2xl p-3 text-center">
        📊 Valós idejű adatok: {data.length} mérés | Frissítés: 1 másodpercenként
      </div>

      {/* Clear DTC Confirmation Dialog */}
      <AnimatePresence>
        {pendingClear && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Hibakód törlése</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Az alábbi hibakód törlődik az autó memóriájából:
                  </p>
                </div>
              </div>

              <div className="bg-secondary rounded-xl p-4 mb-4 border border-border">
                <p className="text-center text-lg font-mono font-bold text-foreground">{pendingClear}</p>
              </div>

              <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                ⚠️ A hibakód törléséhez gyújts fel a motort és vezetj egy rövid tesztutat az adatok újra olvasásához.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => setPendingClear(null)}
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-muted transition-colors"
                >
                  Mégse
                </button>
                <button
                  onClick={() => handleClearDTC(pendingClear)}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors"
                >
                  Igen, törlöm!
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}