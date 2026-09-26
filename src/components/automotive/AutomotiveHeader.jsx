import { memo, useState } from 'react';
import { Plus, Bluetooth, AlertCircle, ChevronDown, Check, RefreshCw, Usb, Wifi } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const ADAPTER_OPTIONS = [
  { value: 'auto', label: '✨ Automatikus OBD felismerés' },
  { value: 'usb', label: '🔌 USB / COM ELM327, OBDLink' },
  { value: 'bluetooth-classic', label: '🔵 Bluetooth Classic (Windows COM)' },
  { value: 'bluetooth-le', label: '🟦 Bluetooth LE / OBDLink CX' },
  { value: 'wifi', label: '📡 Wi-Fi OBD2 (TCP)' },
];

const AutomotiveHeader = memo(function AutomotiveHeader({
  obd2Manager, obd2Status, obd2Connecting, adapterType, setAdapterType,
  wifiIP, setWifiIP, usbPort, setUsbPort, serialPorts = [], onRefreshPorts,
  viewMode, setViewMode, lastDiagnosis, isRecordingTrip, toggleTripRecording,
  vehicleProfile, onConnect, onDisconnect, onNewChat,
}) {
  const [showAdapterSheet, setShowAdapterSheet] = useState(false);
  const selectedLabel = ADAPTER_OPTIONS.find((option) => option.value === adapterType)?.label || adapterType;
  const usesSerial = adapterType === 'usb' || adapterType === 'bluetooth-classic';

  return (
    <div className="px-4 md:px-8 lg:px-10 py-3 md:py-4 border-b border-primary/10 bg-card/75 backdrop-blur-xl shrink-0 space-y-2 max-w-[1500px] w-full mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="jarvis-core-orb w-9 h-9 rounded-xl flex items-center justify-center">
            <span className="text-sm">🔧</span>
          </div>
          <div>
            <h1 className="text-base md:text-lg font-semibold text-foreground">Jarvis OBD Reader</h1>
            <p className="text-[10px] md:text-xs text-muted-foreground">USB · Bluetooth Classic · BLE · Wi-Fi TCP</p>
          </div>
        </div>
        <button onClick={onNewChat} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center" title="Új diagnosztika">
          <Plus size={16} className="text-muted-foreground" />
        </button>
      </div>

      {!obd2Manager && (
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2">
          <button
            onClick={() => setShowAdapterSheet(true)}
            className="w-full bg-secondary rounded-xl px-3 py-2.5 text-sm border border-border text-foreground flex items-center justify-between"
          >
            <span>{selectedLabel}</span>
            <ChevronDown size={16} className="text-muted-foreground" />
          </button>
          <button
            onClick={onRefreshPorts}
            className="px-3 py-2.5 rounded-xl bg-secondary border border-border text-muted-foreground hover:text-foreground flex items-center justify-center gap-2 text-xs"
            title="COM portok frissítése"
          >
            <RefreshCw size={14} /> Portok
          </button>

          <Sheet open={showAdapterSheet} onOpenChange={setShowAdapterSheet}>
            <SheetContent side="bottom" className="rounded-t-3xl pb-8">
              <SheetHeader className="mb-4">
                <SheetTitle>OBD kapcsolat</SheetTitle>
              </SheetHeader>
              <div className="space-y-2">
                {ADAPTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => { setAdapterType(option.value); setShowAdapterSheet(false); }}
                    className={adapterType === option.value
                      ? 'w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium bg-primary/15 text-primary border border-primary/30'
                      : 'w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium bg-secondary text-foreground'}
                  >
                    {option.label}
                    {adapterType === option.value && <Check size={16} />}
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      )}

      {adapterType === 'wifi' && !obd2Manager && (
        <div className="relative">
          <Wifi size={15} className="absolute left-3 top-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="192.168.0.10:35000"
            value={wifiIP}
            onChange={(event) => setWifiIP(event.target.value)}
            className="w-full bg-secondary rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none border border-border text-foreground font-mono"
          />
        </div>
      )}

      {usesSerial && !obd2Manager && (
        <div className="relative">
          <Usb size={15} className="absolute left-3 top-3 text-muted-foreground pointer-events-none" />
          <select
            value={usbPort}
            onChange={(event) => setUsbPort(event.target.value)}
            className="w-full bg-secondary rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none border border-border text-foreground"
          >
            <option value="">Válassz COM portot...</option>
            {serialPorts.map((port) => (
              <option key={port.path} value={port.path}>
                {port.path}{port.manufacturer ? ` · ${port.manufacturer}` : ''}{port.score > 0 ? ' · ajánlott' : ''}
              </option>
            ))}
          </select>
          {serialPorts.length === 0 && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Nem látok soros portot. USB-nél csatlakoztasd az adaptert; Bluetooth Classicnál előbb párosítsd Windowsban.
            </p>
          )}
        </div>
      )}

      <button
        onClick={obd2Manager ? onDisconnect : onConnect}
        disabled={obd2Connecting}
        className={obd2Manager
          ? 'w-full py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 bg-green-500/20 text-green-400 border border-green-500/30'
          : 'w-full py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:brightness-110'}
      >
        <Bluetooth size={14} />
        {obd2Connecting ? 'Csatlakozás...' : obd2Manager ? '🟢 OBD2 Csatlakozva' : 'OBD csatlakoztatása'}
      </button>

      <AnimatePresence>
        {obd2Status && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={obd2Status.includes('✅')
              ? 'text-xs px-3 py-2 rounded-lg flex items-center gap-2 bg-green-500/10 text-green-400 border border-green-500/30'
              : obd2Status.includes('❌')
                ? 'text-xs px-3 py-2 rounded-lg flex items-center gap-2 bg-red-500/10 text-red-400 border border-red-500/30'
                : 'text-xs px-3 py-2 rounded-lg flex items-center gap-2 bg-primary/10 text-primary border border-primary/20'}
          >
            {obd2Status.includes('❌') && <AlertCircle size={12} />}
            {obd2Status}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2">
        {['vin', 'chat', ...(obd2Manager ? ['dashboard'] : [])].map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={viewMode === mode
              ? 'flex-1 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground'
              : 'flex-1 py-2 rounded-xl text-sm font-medium bg-secondary text-foreground'}
          >
            {mode === 'vin' ? '🚗 VIN' : mode === 'chat' ? '💬 Chat' : '📊 Ëlő adatok'}
          </button>
        ))}
      </div>

      {obd2Manager && (
        <button
          onClick={toggleTripRecording}
          className={isRecordingTrip
            ? 'w-full py-2 rounded-xl text-sm font-medium bg-red-500 text-white animate-pulse'
            : 'w-full py-2 rounded-xl text-sm font-medium bg-yellow-500/90 text-white'}
        >
          {isRecordingTrip ? '🔴 Naplózás: AKTÍV' : '📍 Útvonal naplózás indítása'}
        </button>
      )}

      {lastDiagnosis && (
        <button
          onClick={() => setViewMode('parts')}
          className={viewMode === 'parts'
            ? 'w-full py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground'
            : 'w-full py-2 rounded-xl text-sm font-medium bg-secondary text-foreground'}
        >
          ⚙️ Alkatrészek
        </button>
      )}

      <button
        onClick={() => setViewMode('trips')}
        className={viewMode === 'trips'
          ? 'w-full py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground'
          : 'w-full py-2 rounded-xl text-sm font-medium bg-secondary text-foreground'}
      >
        🗺️ Útvonal előzmények
      </button>

      {vehicleProfile && (
        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-3">
          <p className="text-xs font-semibold text-primary">🚗 Jelenlegi jármű</p>
          <p className="text-sm text-foreground mt-1">{vehicleProfile.manufacturer} {vehicleProfile.year}</p>
          <p className="text-xs text-muted-foreground">VIN: {vehicleProfile.vin}</p>
        </div>
      )}
    </div>
  );
});

export default AutomotiveHeader;
