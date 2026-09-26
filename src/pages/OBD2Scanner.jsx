import { useState, useEffect } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { Wrench, Plus, Loader2, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import OBD2ConnectButton from '@/components/obd2/OBD2ConnectButton';
import OBD2DataReader from '@/components/obd2/OBD2DataReader';
import DiagnosticHistory from '@/components/obd2/DiagnosticHistory';
import SessionDetail from '@/components/obd2/SessionDetail';
import { decodeVIN } from '@/lib/vinDecoder';

export default function OBD2Scanner() {
  const navigate = useNavigate();
  const [manager, setManager] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [vinInput, setVinInput] = useState('');
  const [decodedVIN, setDecodedVIN] = useState(null);
  const [activeScan, setActiveScan] = useState(null);
  const [scanHistory, setScanHistory] = useState([]);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);

  useEffect(() => {
    jarvis.entities.VehicleProfile.filter({}).then(setVehicles).catch(() => {});
    jarvis.entities.OBDSession.filter({}, '-start_time', 10).then(setScanHistory).catch(() => {});
  }, []);

  const handleConnected = (obd2Manager) => {
    setManager(obd2Manager);
  };

  const handleStartScan = async () => {
    if (!manager || !selectedVehicle) return;

    const sessionId = `scan_${Date.now()}`;
    setActiveScan(sessionId);

    try {
      const session = await jarvis.entities.OBDSession.create({
        vehicle_id: selectedVehicle.id,
        start_time: new Date().toISOString(),
        status: 'scanning',
        engine_running: true,
        rpm_data: [],
        temperature_data: [],
        dtc_codes: [],
        adapter_type: 'ELM327'
      });

      // 30 másodpercig adatokat gyűjtünk
      const startTime = Date.now();
      const rpmReadings = [];
      const tempReadings = [];
      let dtcCodes = [];

      const collectInterval = setInterval(async () => {
        try {
          const rpmReading = await manager.readPID('ENGINE_RPM');
          const tempReading = await manager.readPID('COOLANT_TEMP');
          
          if (rpmReading) rpmReadings.push(Number(rpmReading.value) || 0);
          if (tempReading) tempReadings.push(Number(tempReading.value) || 0);

          if (Date.now() - startTime > 30000) {
            clearInterval(collectInterval);
            
            // DTC kódok
            dtcCodes = await manager.readDTCs();

            const completedSession = {
              end_time: new Date().toISOString(),
              status: 'completed',
              rpm_data: rpmReadings,
              temperature_data: tempReadings,
              dtc_codes: dtcCodes
            };

            await jarvis.entities.OBDSession.update(session.id, completedSession);

            if (dtcCodes.length > 0) {
              jarvis.functions.invoke('generateOBDDiagnosis', {
                session_id: session.id,
                vehicle_id: selectedVehicle.id,
                dtc_codes: dtcCodes,
                rpm_data: rpmReadings,
                temperature_data: tempReadings,
                vehicle_info: selectedVehicle,
              }).then((response) => {
                const diagnosis = response.data?.diagnosis;
                if (diagnosis) {
                  setScanHistory((prev) => prev.map((item) => item.id === session.id ? { ...item, ...completedSession, ai_diagnosis: diagnosis } : item));
                }
              }).catch(() => null);
            }

            setScanHistory((prev) => [{ ...session, ...completedSession }, ...prev.filter((item) => item.id !== session.id)]);
            setActiveScan(null);
          }
        } catch (err) {
          console.error('Scan hiba:', err);
        }
      }, 2000);
    } catch (err) {
      setActiveScan(null);
      console.error('Session létrehozási hiba:', err);
    }
  };

  const handleAddVehicle = async () => {
    if (!vinInput.trim()) return;

    const decoded = decodeVIN(vinInput.toUpperCase());
    if (!decoded.isValid) {
      setDecodedVIN({ error: 'Érvénytelen VIN' });
      return;
    }

    try {
      const vehicle = await jarvis.entities.VehicleProfile.create({
        vin: vinInput.toUpperCase(),
        make: decoded.manufacturer,
        model: decoded.vds,
        year: decoded.year,
        engine_type: 'Unknown',
        last_scan_date: new Date().toISOString(),
        is_primary: vehicles.length === 0
      });

      setVehicles(prev => [vehicle, ...prev]);
      setVinInput('');
      setDecodedVIN(null);
      setShowAddVehicle(false);
      setSelectedVehicle(vehicle);
    } catch (err) {
      console.error('Jármű hozzáadási hiba:', err);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="px-4 pt-5 pb-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <ArrowLeft size={16} className="text-muted-foreground" />
          </button>
          <div className="w-10 h-10 rounded-2xl bg-yellow-500/20 flex items-center justify-center">
            <Wrench size={20} className="text-yellow-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">OBD2 szkenner</h1>
            <p className="text-xs text-muted-foreground">ELM327 és teljes diagnosztika</p>
          </div>
        </div>

        <button
          onClick={() => navigate('/fuel-tracker')}
          className="w-full bg-green-500/10 border border-green-500/30 rounded-2xl p-4 text-left hover:bg-green-500/15 transition-colors"
        >
          <p className="text-sm font-semibold text-green-400">⛽ Üzemanyag-követés</p>
          <p className="text-xs text-muted-foreground mt-1">Tankolások, valós fogyasztás és költséggrafikon</p>
        </button>

        {/* Bluetooth kapcsolat */}
        <OBD2ConnectButton
          onConnected={handleConnected}
          onError={(err) => console.error('Bluetooth hiba:', err)}
        />

        {/* Járművek kiválasztása */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Járműveim</h2>
            <button
              onClick={() => setShowAddVehicle(true)}
              className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1"
            >
              <Plus size={12} />
              Új jármű
            </button>
          </div>

          {vehicles.length === 0 ? (
            <div className="bg-secondary/50 rounded-lg p-4 text-center text-xs text-muted-foreground">
              Nincs jármű. Kattints az "Új jármű" gombra!
            </div>
          ) : (
            <div className="space-y-2">
              {vehicles.map(vehicle => (
                <button
                  key={vehicle.id}
                  onClick={() => setSelectedVehicle(vehicle)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedVehicle?.id === vehicle.id
                      ? 'bg-primary/10 border-primary'
                      : 'bg-card border-border hover:bg-secondary'
                  }`}
                >
                  <div className="font-medium text-sm text-foreground">
                    {vehicle.make} {vehicle.model} ({vehicle.year})
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{vehicle.vin}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* OBD2 adatok */}
        {manager && selectedVehicle && (
          <>
            <OBD2DataReader manager={manager} autoRead={!activeScan} />

            {/* Scan gomb */}
            <button
              onClick={handleStartScan}
              disabled={!manager || !selectedVehicle || activeScan}
              className={`w-full py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all ${
                activeScan
                  ? 'bg-orange-500 text-white'
                  : 'bg-green-500 text-white hover:bg-green-600'
              } ${!manager || !selectedVehicle ? 'opacity-50' : ''}`}
            >
              {activeScan ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Scan folyamatban ({Math.random().toString().slice(-2)}%)...
                </>
              ) : (
                <>🔍 Diagnosztikai Scan Indítása</>
              )}
            </button>
          </>
        )}

        {/* Diagnosztikai előzmények */}
        <DiagnosticHistory onSelectSession={setSelectedSession} />
      </div>

      {/* Session Detail Modal */}
      {selectedSession && (
        <SessionDetail session={selectedSession} onClose={() => setSelectedSession(null)} />
      )}

      {/* Add Vehicle Modal */}
      <AnimatePresence>
        {showAddVehicle && (
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
              className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5"
            >
              <h2 className="text-base font-semibold text-foreground mb-4">Jármű hozzáadása VIN-ből</h2>
              <div className="space-y-3">
                <input
                  className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none border border-border text-foreground uppercase font-mono"
                  placeholder="VIN (17 karakter) - pl. WBADT43452G296706"
                  value={vinInput}
                  onChange={e => setVinInput(e.target.value)}
                  maxLength={17}
                />

                {decodedVIN && (
                  <div className={`rounded-lg p-3 text-xs ${
                    decodedVIN.error
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-green-500/10 text-green-400'
                  }`}>
                    {decodedVIN.error ? (
                      decodedVIN.error
                    ) : (
                      <>
                        ✅ {decodedVIN.manufacturer} {decodedVIN.modelYear}
                      </>
                    )}
                  </div>
                )}

                <button
                  onClick={handleAddVehicle}
                  disabled={!vinInput.trim() || decodedVIN?.error}
                  className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-40"
                >
                  Jármű hozzáadása
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}