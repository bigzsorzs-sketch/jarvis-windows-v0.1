import { useEffect, useState } from 'react';
import { X, Download } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { jarvis } from '@/api/jarvisClient';
import RepairCostEstimator from '@/components/obd2/RepairCostEstimator';
import GeminiDiagnosisPanel from '@/components/obd2/GeminiDiagnosisPanel';

export default function SessionDetail({ session: initialSession, onClose }) {
  const [vehicle, setVehicle] = useState(null);
  const [currentSession, setCurrentSession] = useState(initialSession);

  useEffect(() => {
    setCurrentSession(initialSession);
  }, [initialSession]);

  useEffect(() => {
    if (!currentSession?.vehicle_id) return;
    jarvis.entities.VehicleProfile.filter({ id: currentSession.vehicle_id }, '-created_date', 1)
      .then((items) => setVehicle(items?.[0] || null))
      .catch(() => setVehicle(null));
  }, [currentSession?.vehicle_id]);

  if (!currentSession) return null;

  const session = currentSession;

  const startDate = new Date(session.start_time);
  const endDate = session.end_time ? new Date(session.end_time) : null;
  const duration = endDate ? endDate - startDate : 0;
  const durationSeconds = Math.round(duration / 1000);

  // Prepare chart data
  const chartData = (session.rpm_data || []).slice(0, 60).map((rpm, idx) => ({
    time: idx,
    rpm: rpm || 0,
    temp: (session.temperature_data || [])[idx] || 0,
  }));

  const rpmAvg = session.rpm_data?.length
    ? (session.rpm_data.reduce((a, b) => a + b, 0) / session.rpm_data.length).toFixed(0)
    : 0;
  const rpmMax = session.rpm_data?.length ? Math.max(...session.rpm_data).toFixed(0) : 0;
  const tempAvg = session.temperature_data?.length
    ? (session.temperature_data.reduce((a, b) => a + b, 0) / session.temperature_data.length).toFixed(1)
    : 0;
  const tempMax = session.temperature_data?.length
    ? Math.max(...session.temperature_data).toFixed(1)
    : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50 flex items-end"
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25 }}
          className="w-full max-w-2xl mx-auto bg-card rounded-t-3xl overflow-hidden flex flex-col h-[80vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-foreground">📊 Munkamenet részletek</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {startDate.toLocaleDateString('hu-HU')} {startDate.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-muted"
            >
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-secondary rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Időtartam</p>
                <p className="text-lg font-bold text-foreground">{durationSeconds}s</p>
              </div>
              <div className="bg-secondary rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Adapter</p>
                <p className="text-sm font-semibold text-foreground">{session.adapter_type || 'Ismeretlen'}</p>
              </div>
              <div className="bg-secondary rounded-lg p-3">
                <p className="text-xs text-muted-foreground">RPM átlag / Max</p>
                <p className="text-sm font-semibold text-foreground">{rpmAvg} / {rpmMax}</p>
              </div>
              <div className="bg-secondary rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Hőm. átlag / Max</p>
                <p className="text-sm font-semibold text-foreground">{tempAvg}°C / {tempMax}°C</p>
              </div>
            </div>

            {/* RPM Chart */}
            {chartData.length > 0 && (
              <div className="bg-secondary rounded-lg p-3">
                <p className="text-sm font-semibold text-foreground mb-2">RPM trend</p>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }} />
                    <Line type="monotone" dataKey="rpm" stroke="#facc15" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* DTC Codes */}
            {session.dtc_codes && session.dtc_codes.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-sm font-semibold text-red-400 mb-2">Hibakódok ({session.dtc_codes.length})</p>
                <div className="space-y-1">
                  {session.dtc_codes.map((code, idx) => (
                    <p key={idx} className="text-xs font-mono text-foreground">
                      {code}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <RepairCostEstimator session={session} vehicle={vehicle} />

            <GeminiDiagnosisPanel
              session={session}
              vehicle={vehicle}
              onDiagnosisReady={(ai_diagnosis) => setCurrentSession((prev) => ({ ...prev, ai_diagnosis }))}
            />

            {/* Repair estimate */}
            {session.repair_estimate && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                <p className="text-sm font-semibold text-yellow-400">💰 Javítási költség</p>
                <p className="text-xs text-foreground mt-1 capitalize">{session.repair_estimate}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border bg-secondary/30 shrink-0 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Status: <span className="font-semibold">{session.status === 'completed' ? '✅ Befejezve' : '⏳ Folyamatban'}</span>
            </p>
            <button
              onClick={() => {
                const data = JSON.stringify(session, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `session_${new Date(session.start_time).getTime()}.json`;
                a.click();
              }}
              className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors flex items-center gap-1"
            >
              <Download size={12} />
              Exportálás
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}