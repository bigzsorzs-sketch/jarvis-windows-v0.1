import { useState, memo } from 'react';
import { decodeVIN, validateVIN } from '@/lib/vinDecoder';
import { cacheVehicleProfile } from '@/lib/diagnosticsCache';
import { saveVehicleProfileLocally } from '@/lib/offlineStorage';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const VINScanner = memo(function VINScanner({ onVINDecoded }) {
  const [vin, setVin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [decoded, setDecoded] = useState(null);

  const handleDecode = async () => {
    if (!vin.trim()) {
      setError('Add meg a VIN számot!');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Validate VIN format
      if (!validateVIN(vin.toUpperCase())) {
        setError('Érvénytelen VIN! Ellenőrizd az adatokat.');
        setLoading(false);
        return;
      }

      // Decode VIN
      const vehicleData = await decodeVIN(vin.toUpperCase());

      // Cache to IndexedDB
      await cacheVehicleProfile(vehicleData);

      // Save locally
      saveVehicleProfileLocally(vehicleData);

      setDecoded(vehicleData);
      setVin('');

      if (onVINDecoded) {
        onVINDecoded(vehicleData);
      }
    } catch (err) {
      console.error('VIN decode error:', err);
      setError('A VIN-t most nem tudtuk beolvasni. Ellenőrizd és próbáld újra.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-2xl p-4">
        <label className="text-sm font-semibold text-foreground block mb-2">
          🚗 VIN szám (17 karakter)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="pl. WBADT43452G926206"
            value={vin}
            onChange={(e) => {
              setVin(e.target.value.toUpperCase());
              setError('');
            }}
            maxLength={17}
            className="flex-1 bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground uppercase font-mono"
            disabled={loading}
          />
          <button
            onClick={handleDecode}
            disabled={loading || vin.length !== 17}
            className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 transition-all"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          </button>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          ℹ️ A VIN az ajtó mellett, szélvédő alatt vagy motorháztető alatt található.
        </p>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 flex items-start gap-2"
          >
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Decoded Info */}
      <AnimatePresence>
        {decoded && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-primary/10 border border-primary/30 rounded-2xl p-4 space-y-2"
          >
            <div className="flex items-center gap-2">
              <Check size={16} className="text-primary" />
              <p className="text-sm font-semibold text-primary">VIN dekódolva!</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mt-3">
              <div className="bg-card rounded-lg p-2 border border-border">
                <p className="text-muted-foreground">Gyártó</p>
                <p className="font-semibold text-foreground">{decoded.manufacturer}</p>
              </div>
              <div className="bg-card rounded-lg p-2 border border-border">
                <p className="text-muted-foreground">Év</p>
                <p className="font-semibold text-foreground">{decoded.year}</p>
              </div>
              <div className="bg-card rounded-lg p-2 border border-border col-span-2">
                <p className="text-muted-foreground">Ország</p>
                <p className="font-semibold text-foreground">{decoded.country}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default VINScanner;