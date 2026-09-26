import { memo, useState } from 'react';
import { Plus, Bluetooth, AlertCircle, ChevronDown, Check, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const ADAPTER_OPTIONS = [
  { value: 'bluetooth-elm327', label: '🔵 Bluetooth ELM327' },
  { value: 'wifi', label: '📡 WiFi OBD2 (iCar Pro, MX+)' },
  { value: 'usb', label: '🔌 USB ELM327' },
  { value: 'stn1110', label: '⚡ STN1110 Professzionális' },
  { value: 'hscan', label: '🚗 HS-CAN (2010+ autók)' },
];

const AutomotiveHeader = memo(function AutomotiveHeader({
  obd2Manager, obd2Status, obd2Connecting, adapterType, setAdapterType,
  wifiIP, setWifiIP, usbPort, setUsbPort, usbPorts = [], onRefreshUsbPorts, connectionMeta,
  viewMode, setViewMode, lastDiagnosis, isRecordingTrip, toggleTripRecording, vehicleProfile,
  onConnect, onDisconnect, onNewChat,
}) {
  const [showAdapterSheet, setShowAdapterSheet] = useState(false);
  const selectedLabel = ADAPTER_OPTIONS.find(o => o.value === adapterType)?.label || adapterType;

  return (
    <div className="px-4 py-3 border-b border-border bg-card shrink-0 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <span className="text-sm">🔧</span>
          </div>
          <h1 className="text-base font-semibold text-foreground">Autó Diagnosztika</h1>
        </div>
        <button onClick={onNewChat} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center" title="Új diagnosztika">
          <Plus size={16} className="text-muted-foreground" />
        </button>
      </div>

      {!obd2Manager && (
        <>
          <button
            onClick={() => setShowAdapterSheet(true)}
            className="w-full bg-secondary rounded-xl px-3 py-2.5 text-sm border border-border text-foreground flex items-center justify-between"
          >
            <span>{selectedLabel}</span>
            <ChevronDown size={16} className="text-muted-foreground" />
          </button>
          <Sheet open={showAdapterSheet} onOpenChange={setShowAdapterSheet}>
            <SheetContent side="bottom" className="rounded-t-3xl pb-8">
              <SheetHeader className="mb-4">
                <SheetTitle>Adapter típusa</SheetTitle>
              </SheetHeader>
              <div className="space-y-2">
                {ADAPTER_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setAdapterType(opt.value); setShowAdapterSheet(false); }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
                      adapterType === opt.value ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-secondary text-foreground'
                    }`}
                  >
                    {opt.label}
                    {adapterType === opt.value && <Check size={16} />}
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}

      {adapterType === 'wifi' && !obd2Manager && (
        <input type="text" placeholder="WiFi IP:port (pl. 192.168.0.10:35000)" value={wifiIP}
          onChange={e => setWifiIP(e.target.value)}
          className="w-full bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-border text-foreground" />
      )}

      {adapterType === 'usb' && !obd2Manager && (
        <div className="flex gap-2">
          <select
            value={usbPort}
            onChange={e => setUsbPort(e.target.value)}
            className="flex-1 bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-border text-foreground"
          >
            <option value="">Válassz COM portot</option>
            {usbPorts.map((port) => (
              <option key={port.path} value={port.path}>
                {port.path}{port.manufacturer ? ' — ' + port.manufacturer : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onRefreshUsbPorts?.()}
            className="w-11 rounded-xl bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
            title="COM portok újrakeresése"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      )}

      <button onClick={obd2Manager ? onDisconnect : onConnect} disabled={obd2Connecting}
        className={`w-full py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
          obd2Manager ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        } ${obd2Connecting ? 'opacity-60' : ''}`}>
        <Bluetooth size={14} />
        {obd2Connecting ? 'Csatlakozás...' : obd2Manager ? '🟢 OBD2 Csatlakozva' : 'Csatlakoztatás'}
      </button>

      {obd2Manager && connectionMeta && (
        <div className="text-[11px] text-muted-foreground px-1">
          {connectionMeta.device || connectionMeta.adapterType}
          {connectionMeta.port ? ' • ' + connectionMeta.port : ''}
          {connectionMeta.baudRate ? ' • ' + connectionMeta.baudRate + ' baud' : ''}
          {connectionMeta.adapterInfo ? ' • ' + connectionMeta.adapterInfo : ''}
        </div>
      )}

      <AnimatePresence>
        {obd2Status && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className={`text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${
              obd2Status.includes('✅') ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                : obd2Status.includes('❌') ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
            }`}>
            {obd2Status.includes('❌') && <AlertCircle size={12} />}
            {obd2Status}
          </motion.div>
        )}
      </AnimatePresence>

      {/* View tabs */}
      <div className="flex gap-2">
        {['vin', 'chat', ...(obd2Manager ? ['dashboard'] : [])].map(mode => (
          <button key={mode} onClick={() => setViewMode(mode)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${viewMode === mode ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
            {mode === 'vin' ? '🚗 VIN' : mode === 'chat' ? '💬 Chat' : '📊 Műszerfal'}
          </button>
        ))}
      </div>

      {obd2Manager && (
        <button onClick={toggleTripRecording}
          className={`w-full py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            isRecordingTrip ? 'bg-red-500 text-white animate-pulse' : 'bg-yellow-500 text-white hover:bg-yellow-600'
          }`}>
          {isRecordingTrip ? '🔴 Naplózás: AKTÍV' : '📍 Útvonal naplózás indítása'}
        </button>
      )}

      {lastDiagnosis && (
        <button onClick={() => setViewMode('parts')}
          className={`w-full py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${viewMode === 'parts' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
          ⚙️ Alkatrészek
        </button>
      )}

      <button onClick={() => setViewMode('trips')}
        className={`w-full py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${viewMode === 'trips' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
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