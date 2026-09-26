import { useEffect, useState } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { Clock, AlertCircle, CheckCircle2, Trash2, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { saveEncryptedLocalBackup, removeEncryptedLocalBackup } from '@/lib/encryptedLocalBackup';
import EncryptedLocalBackupNotice from '@/components/privacy/EncryptedLocalBackupNotice';

export default function DiagnosticHistory({ onSelectSession }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const user = await jarvis.auth.me();
      const data = user?.email ? await jarvis.entities.OBDSession.filter({ created_by: user.email }, '-start_time', 50) : [];
      setSessions(data);
      if (user?.email && data.length > 0) {
        await saveEncryptedLocalBackup('diagnostic-history', data, user.email);
      }
    } catch (error) {
      console.error('Session load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Biztosan törölni akarod a munkamenetet?')) {
      try {
        await jarvis.entities.OBDSession.delete(id);
        const nextSessions = sessions.filter((s) => s.id !== id);
        setSessions(nextSessions);
        if (nextSessions.length > 0) {
          const user = await jarvis.auth.me();
          await saveEncryptedLocalBackup('diagnostic-history', nextSessions, user?.email || 'default');
        } else {
          removeEncryptedLocalBackup('diagnostic-history');
        }
      } catch (error) {
        console.error('Delete error:', error);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock size={32} className="mx-auto opacity-30 mb-3" />
        <p className="text-sm">Nincsenek diagnosztikai munkamenetek. Indítsd el az első scant!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <EncryptedLocalBackupNotice label="Diagnosztikai előzmények titkosított lokális mentése aktív" />
      <h3 className="text-sm font-semibold text-foreground">Diagnosztikai előzmények ({sessions.length})</h3>

      <AnimatePresence>
        {sessions.map((session, idx) => {
          const startDate = new Date(session.start_time);
          const endDate = session.end_time ? new Date(session.end_time) : null;
          const duration = endDate ? endDate - startDate : 0;
          const durationSeconds = Math.round(duration / 1000);

          const dtcCount = session.dtc_codes?.length || 0;
          const rpmAvg = session.rpm_data?.length
            ? (session.rpm_data.reduce((a, b) => a + b, 0) / session.rpm_data.length).toFixed(0)
            : 0;
          const tempAvg = session.temperature_data?.length
            ? (session.temperature_data.reduce((a, b) => a + b, 0) / session.temperature_data.length).toFixed(1)
            : 0;

          return (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-card border border-border rounded-xl p-3 space-y-2 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    {startDate.toLocaleDateString('hu-HU')} {startDate.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
                    {session.status === 'completed' ? (
                      <CheckCircle2 size={14} className="text-green-500" />
                    ) : (
                      <AlertCircle size={14} className="text-yellow-500" />
                    )}
                  </p>

                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                    <span>⏱️ {durationSeconds}s</span>
                    {rpmAvg > 0 && <span>💨 {rpmAvg} RPM átl.</span>}
                    {tempAvg > 0 && <span>🌡️ {tempAvg}°C</span>}
                    {session.adapter_type && <span>🔌 {session.adapter_type}</span>}
                  </div>

                  {dtcCount > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {session.dtc_codes?.slice(0, 3).map((code, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-xs font-mono"
                        >
                          {code}
                        </span>
                      ))}
                      {dtcCount > 3 && (
                        <span className="px-2 py-0.5 text-xs text-muted-foreground">
                          +{dtcCount - 3} további
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => onSelectSession(session)}
                    className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    title="Részletek"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(session.id)}
                    className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    title="Törlés"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}