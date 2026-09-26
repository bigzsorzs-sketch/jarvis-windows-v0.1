import { useEffect, useState } from 'react';
import { BrainCircuit, Loader2 } from 'lucide-react';
import { jarvis } from '@/api/jarvisClient';

export default function GeminiDiagnosisPanel({ session, vehicle, onDiagnosisReady }) {
  const [diagnosis, setDiagnosis] = useState(session?.ai_diagnosis || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setDiagnosis(session?.ai_diagnosis || '');
  }, [session?.ai_diagnosis]);

  useEffect(() => {
    if (!session?.id || diagnosis || loading || !(session.dtc_codes?.length > 0)) return;

    setLoading(true);
    jarvis.functions.invoke('generateOBDDiagnosis', {
      session_id: session.id,
      vehicle_id: session.vehicle_id,
      dtc_codes: session.dtc_codes || [],
      rpm_data: session.rpm_data || [],
      temperature_data: session.temperature_data || [],
      vehicle_info: vehicle || {},
    }).then((response) => {
      const text = response.data?.diagnosis || '';
      setDiagnosis(text);
      onDiagnosisReady?.(text);
    }).finally(() => setLoading(false));
  }, [session?.id, vehicle?.id]);

  if (!(session?.dtc_codes?.length > 0)) return null;

  return (
    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
      <p className="text-sm font-semibold text-blue-400 mb-2 flex items-center gap-2">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <BrainCircuit size={15} />}
        Jarvis AI diagnosztika
      </p>
      {loading ? (
        <p className="text-xs text-muted-foreground">Jarvis elemzi a hibakódokat és a jármű adatait...</p>
      ) : (
        <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">{diagnosis}</p>
      )}
    </div>
  );
}