import { useEffect, useState } from 'react';
import { getTrips, deleteTrip } from '@/lib/tripLogger';
import { MapPin, Trash2, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { requestAppDialogApproval } from '@/lib/appDialog';

export default function TripHistory({ onViewTrip }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrips();
  }, []);

  const loadTrips = async () => {
    try {
      const data = await getTrips();
      setTrips(data);
    } catch (error) {
      console.error('Trip load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    const approved = await requestAppDialogApproval('Biztos törölni akarod az útvonalat?');
    if (!approved) return;

    try {
      await deleteTrip(id);
      setTrips((prev) => prev.filter((t) => t.id !== id));
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <MapPin size={32} className="mx-auto opacity-30 mb-3" />
        <p className="text-sm">Nincsenek mentett útvonalak. Indítsd el az első úti naplózást!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Korábbi útvonalak ({trips.length})</h3>

      <AnimatePresence>
        {trips.map((trip, idx) => {
          const startDate = new Date(trip.startTime);
          const endDate = trip.endTime ? new Date(trip.endTime) : null;
          const duration = endDate ? endDate - startDate : 0;
          const durationMinutes = Math.round(duration / 60000);
          const problemCount = trip.obd2Data?.filter((d) => {
            if (d.metric === 'Motorolaj hőm.' && d.value > 110) return true;
            if (d.metric === 'RPM' && d.value > 6500) return true;
            if (d.metric === 'Turbónyomás' && d.value > 300) return true;
            return false;
          }).length || 0;

          return (
            <motion.div
              key={trip.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-card border border-border rounded-xl p-3 space-y-2 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {startDate.toLocaleDateString('hu-HU')} {startDate.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                    <span>📍 {trip.distance?.toFixed(1) || 0} km</span>
                    <span>⏱️ {durationMinutes} perc</span>
                    {trip.coordinates?.length > 0 && (
                      <span>📡 {trip.coordinates.length} pont</span>
                    )}
                    {problemCount > 0 && (
                      <span className="text-orange-400">⚠️ {problemCount} probléma</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => onViewTrip(trip)}
                    className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    title="Térkép nézet"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(trip.id)}
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