import { useState, useCallback } from 'react';
import { TripLogger, saveTrip } from '@/lib/tripLogger';

/**
 * Hook for managing trip recording lifecycle.
 */
export function useTripLogic(onMessage) {
  const [tripLogger] = useState(() => new TripLogger());
  const [isRecordingTrip, setIsRecordingTrip] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState(null);

  const toggleTripRecording = useCallback(async () => {
    if (isRecordingTrip) {
      const tripData = tripLogger.endTrip();
      try {
        await saveTrip(tripData);
        onMessage(`✅ Útvonal mentve! ${tripData.distance.toFixed(1)} km, ${tripData.obd2Data.length} adatpont.`);
      } catch {
        onMessage('❌ Az útvonalat most nem tudtuk elmenteni. Próbáld meg újra.');
      }
      setIsRecordingTrip(false);
    } else {
      tripLogger.startTrip();
      setIsRecordingTrip(true);
      onMessage('🔴 Útvonal naplózás elkezdve! GPS + OBD2 adatok rögzítése folyamatban.');
    }
  }, [isRecordingTrip, tripLogger, onMessage]);

  return { isRecordingTrip, selectedTrip, setSelectedTrip, toggleTripRecording };
}