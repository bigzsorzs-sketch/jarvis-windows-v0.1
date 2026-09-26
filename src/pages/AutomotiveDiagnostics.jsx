import { useCallback, useEffect, useRef, useState } from 'react';
import TutorialOverlay from '@/components/tutorial/TutorialOverlay';
import ErrorBoundary from '@/components/ErrorBoundary';
import AutomotiveHeader from '@/components/automotive/AutomotiveHeader';
import AutomotiveChatView from '@/components/automotive/AutomotiveChatView';
import OBD2Dashboard from '@/components/obd2/OBD2Dashboard';
import PartsFinder from '@/components/automotive/PartsFinder';
import VINScanner from '@/components/automotive/VINScanner';
import TripMapViewer from '@/components/obd2/TripMapViewer';
import TripHistory from '@/components/obd2/TripHistory';
import { useOBDData } from '@/hooks/useOBDData';
import { useTripLogic } from '@/hooks/useTripLogic';
import { useAutomotiveChat } from '@/hooks/useAutomotiveChat';
import { useAutomotivePDF } from '@/hooks/useAutomotivePDF';
import { useJarvisModuleContext } from '@/hooks/useJarvisModuleContext';


const OBD_SNAPSHOT_PIDS = ['ENGINE_RPM', 'COOLANT_TEMP', 'MAF_AIR_FLOW', 'SPEED'];
const PID_LABELS = {
  ENGINE_RPM: 'motorfordulat',
  COOLANT_TEMP: 'hűtővíz-hőmérséklet',
  MAF_AIR_FLOW: 'légtömeg',
  SPEED: 'sebesség',
};
const PID_CHANGE_THRESHOLDS = {
  ENGINE_RPM: 75,
  COOLANT_TEMP: 2,
  MAF_AIR_FLOW: 0.5,
  SPEED: 1,
};

function readingValue(reading) {
  if (reading == null) return null;
  const raw = typeof reading === 'object' ? reading.value : reading;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : raw;
}

function dtcCode(item) {
  if (typeof item === 'string') return item;
  return item?.code || item?.dtc || item?.id || JSON.stringify(item);
}

function compareOBDSnapshots(before, after) {
  const changes = [];

  for (const pid of OBD_SNAPSHOT_PIDS) {
    const oldValue = before?.pids?.[pid] ?? null;
    const newValue = after?.pids?.[pid] ?? null;
    if (oldValue == null && newValue == null) continue;

    if (typeof oldValue === 'number' && typeof newValue === 'number') {
      const threshold = PID_CHANGE_THRESHOLDS[pid] ?? 0;
      if (Math.abs(newValue - oldValue) >= threshold) {
        changes.push(PID_LABELS[pid] + ': ' + oldValue + ' → ' + newValue);
      }
    } else if (oldValue !== newValue) {
      changes.push(PID_LABELS[pid] + ': ' + String(oldValue ?? 'nincs') + ' → ' + String(newValue ?? 'nincs'));
    }
  }

  const beforeCodes = new Set((before?.dtcs || []).map(dtcCode).filter(Boolean));
  const afterCodes = new Set((after?.dtcs || []).map(dtcCode).filter(Boolean));
  const added = [...afterCodes].filter((code) => !beforeCodes.has(code));
  const removed = [...beforeCodes].filter((code) => !afterCodes.has(code));

  if (added.length) changes.push('új hibakód: ' + added.join(', '));
  if (removed.length) changes.push('eltűnt hibakód: ' + removed.join(', '));

  return { changes, added, removed };
}

const TUTORIAL_STEPS = [
  { icon: '🚗', title: 'Autó diagnosztika', description: 'Tartsd nyomon a járműveidet: VIN, motor típus, kilométerállapot.', hint: 'Minden járműnek saját diagnosztikai előzménye van' },
  { icon: '🔧', title: 'OBD2 csatornák', description: 'Az AI OBD2 adatok alapján diagnosztizálja az autót és becsüli a javítás költségét.', hint: 'Összekötés OBD2 adapterrel szükséges a teljes funkcionalitáshoz' },
  { icon: '📋', title: 'Kezdj el!', description: 'Add hozzá az első járművedet a VIN vagy manuális adatokkal.', hint: 'A VIN 17 karakteres azonosító az autó ablakán' },
];

export default function AutomotiveDiagnostics() {
  const [adapterType, setAdapterType] = useState('bluetooth-elm327');
  const [wifiIP, setWifiIP] = useState('192.168.0.10:35000');
  const [usbPort, setUsbPort] = useState('');
  const [viewMode, setViewMode] = useState('chat');
  const [vehicleProfile, setVehicleProfile] = useState(null);

  const {
    obd2Manager, obd2Status, obd2Connecting, usbPorts, connectionMeta,
    listUSBPorts, connect: connectOBDHook, disconnect: disconnectOBDHook
  } = useOBDData();

  useEffect(() => {
    if (adapterType !== 'usb' || obd2Manager) return;
    listUSBPorts().then((ports) => {
      if (!usbPort && ports.length === 1) setUsbPort(ports[0].path);
    }).catch(() => {});
  }, [adapterType, obd2Manager, listUSBPorts, usbPort]);

  const chat = useAutomotiveChat();
  const { isRecordingTrip, selectedTrip, setSelectedTrip, toggleTripRecording } = useTripLogic(chat.addMessage);
  const { pdfLoading, generatePDF } = useAutomotivePDF(chat.lastDiagnosis, chat.lastParts, vehicleProfile, chat.addMessage);
  const lastSnapshotRef = useRef(null);

  const captureOBDSnapshot = useCallback(async () => {
    if (!obd2Manager) throw new Error('OBD_NOT_CONNECTED');

    const pids = {};
    for (const pid of OBD_SNAPSHOT_PIDS) {
      try {
        pids[pid] = readingValue(await obd2Manager.readPID(pid));
      } catch {
        pids[pid] = null;
      }
    }

    let dtcs = [];
    try {
      dtcs = await obd2Manager.readDTCs();
    } catch {
      dtcs = [];
    }

    return {
      at: new Date().toISOString(),
      pids,
      dtcs: Array.isArray(dtcs) ? dtcs : [],
    };
  }, [obd2Manager]);

  // Keep a passive baseline after connecting so a later "változott valami?"
  // can compare against a real earlier vehicle state without extra menu work.
  useEffect(() => {
    if (!obd2Manager) {
      lastSnapshotRef.current = null;
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      captureOBDSnapshot()
        .then((snapshot) => {
          if (!cancelled) lastSnapshotRef.current = snapshot;
        })
        .catch(() => {});
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [obd2Manager, captureOBDSnapshot]);

  const getAutomotiveContext = useCallback(() => ({
    viewMode,
    obdConnected: Boolean(obd2Manager),
    obdStatus,
    adapterType,
    vehicle: vehicleProfile ? {
      vin: vehicleProfile.vin || null,
      make: vehicleProfile.make || null,
      model: vehicleProfile.model || null,
      year: vehicleProfile.year || null,
      engineType: vehicleProfile.engine_type || vehicleProfile.engineType || null,
    } : null,
    hasComparisonBaseline: Boolean(lastSnapshotRef.current),
    lastSnapshotAt: lastSnapshotRef.current?.at || null,
  }), [viewMode, obd2Manager, obd2Status, adapterType, vehicleProfile]);

  const getAutomotiveActions = useCallback(() => ({
    'obd.read_dtcs': {
      description: 'Aktuális OBD hibakódok újraolvasása',
      risk: 'read',
      handler: async () => {
        if (!obd2Manager) return { success: false, message: 'Nincs csatlakoztatott OBD adapter.' };
        const dtcs = await obd2Manager.readDTCs();
        const codes = (Array.isArray(dtcs) ? dtcs : []).map(dtcCode).filter(Boolean);
        return {
          success: true,
          data: { dtcs },
          message: codes.length ? 'Jelenlegi hibakódok: ' + codes.join(', ') + '.' : 'Jelenleg nem látok OBD hibakódot.',
        };
      },
    },
    'obd.read_pid': {
      description: 'Egy élő OBD adat kiolvasása',
      risk: 'read',
      handler: async ({ pid }) => {
        if (!obd2Manager) return { success: false, message: 'Nincs csatlakoztatott OBD adapter.' };
        if (!OBD_SNAPSHOT_PIDS.includes(pid)) return { success: false, message: 'Ezt az élő adatot még nem engedélyeztem a hangos gyorsolvasásban.' };
        const reading = await obd2Manager.readPID(pid);
        const value = readingValue(reading);
        const unit = typeof reading === 'object' ? (reading.unit || '') : '';
        return {
          success: true,
          data: { pid, reading },
          message: PID_LABELS[pid] + ': ' + String(value ?? 'nincs adat') + (unit ? ' ' + unit : '') + '.',
        };
      },
    },
    'obd.snapshot': {
      description: 'OBD pillanatkép készítése összehasonlításhoz',
      risk: 'read',
      handler: async () => {
        const snapshot = await captureOBDSnapshot();
        lastSnapshotRef.current = snapshot;
        const codes = snapshot.dtcs.map(dtcCode).filter(Boolean);
        return {
          success: true,
          data: snapshot,
          message: 'Elmentettem a jelenlegi OBD állapotot összehasonlítási alapnak.' + (codes.length ? ' Hibakód: ' + codes.join(', ') + '.' : ''),
        };
      },
    },
    'obd.compare_snapshot': {
      description: 'Jelenlegi OBD állapot összehasonlítása az előző méréssel',
      risk: 'read',
      handler: async () => {
        const previous = lastSnapshotRef.current;
        const current = await captureOBDSnapshot();
        lastSnapshotRef.current = current;

        if (!previous) {
          return {
            success: true,
            data: { current },
            message: 'Most készítettem el az első összehasonlítási alapot. A következő ellenőrzésnél már meg tudom mondani, mi változott.',
          };
        }

        const comparison = compareOBDSnapshots(previous, current);
        return {
          success: true,
          data: { previous, current, comparison },
          message: comparison.changes.length
            ? 'Változást látok: ' + comparison.changes.join('; ') + '.'
            : 'Nem látok jelentős változást az előző OBD pillanatképhez képest.',
        };
      },
    },
  }), [obd2Manager, captureOBDSnapshot]);

  useJarvisModuleContext({
    id: 'automotive',
    label: 'Autódiagnosztika',
    getContext: getAutomotiveContext,
    getActions: getAutomotiveActions,
  });

  const connectOBD2 = async () => {
    try {
      await connectOBDHook(adapterType, wifiIP, usbPort);
      chat.addMessage(`📡 **OBD2 Csatlakozás Sikeres!** (${adapterType.toUpperCase()})\n\nMost már valós adatokat olvasok. Kérdezz az autóddal kapcsolatos problémáról!`);
    } catch (error) {
      console.error('OBD2 connect failed:', error);
      chat.addMessage('❌ Nem sikerült csatlakozni. Ellenőrizd az eszközt és próbáld újra.');
    }
  };

  const disconnectOBD2 = async () => {
    try {
      await disconnectOBDHook(obd2Manager);
      chat.addMessage('🔌 OBD2 csatlakozás lezárva.');
    } catch (error) {
      console.error('OBD2 disconnect failed:', error);
      chat.addMessage('⚠️ A kapcsolat lezárása közben hiba történt, de folytathatod a diagnosztikát.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <TutorialOverlay tutorialId="automotive-intro" steps={TUTORIAL_STEPS} />
      <AutomotiveHeader
        obd2Manager={obd2Manager} obd2Status={obd2Status} obd2Connecting={obd2Connecting}
        adapterType={adapterType} setAdapterType={setAdapterType}
        wifiIP={wifiIP} setWifiIP={setWifiIP}
        usbPort={usbPort} setUsbPort={setUsbPort}
        usbPorts={usbPorts} onRefreshUsbPorts={listUSBPorts}
        connectionMeta={connectionMeta}
        viewMode={viewMode} setViewMode={setViewMode}
        lastDiagnosis={chat.lastDiagnosis}
        isRecordingTrip={isRecordingTrip} toggleTripRecording={toggleTripRecording}
        vehicleProfile={vehicleProfile}
        onConnect={connectOBD2} onDisconnect={disconnectOBD2}
        onNewChat={chat.resetChat}
      />

      <div className="flex-1 overflow-y-auto">
        {viewMode === 'vin' ? (
          <div className="px-4 py-4 space-y-4">
            <VINScanner onVINDecoded={setVehicleProfile} />
            <div ref={chat.bottomRef} />
          </div>
        ) : viewMode === 'dashboard' && obd2Manager ? (
          <div className="px-4 py-4 space-y-4">
            <ErrorBoundary compact><OBD2Dashboard obd2Manager={obd2Manager} isConnected={!!obd2Manager} /></ErrorBoundary>
            <div ref={chat.bottomRef} />
          </div>
        ) : viewMode === 'parts' && chat.lastDiagnosis ? (
          <div className="px-4 py-4 space-y-4">
            <ErrorBoundary compact>
              <PartsFinder diagnosis={chat.lastDiagnosis.diagnosis} errorCodes={[chat.lastDiagnosis.problemCode].filter(Boolean)} onPartsLoaded={chat.setLastParts} />
            </ErrorBoundary>
            <div ref={chat.bottomRef} />
          </div>
        ) : viewMode === 'trips' ? (
          <div className="px-4 py-4 space-y-4">
            <ErrorBoundary compact><TripHistory onViewTrip={setSelectedTrip} /></ErrorBoundary>
            <div ref={chat.bottomRef} />
          </div>
        ) : (
          <AutomotiveChatView
            messages={chat.messages} loading={chat.loading} bottomRef={chat.bottomRef}
            lastDiagnosis={chat.lastDiagnosis} pdfLoading={pdfLoading} generatePDF={generatePDF}
            attachedImage={chat.attachedImage} setAttachedImage={chat.setAttachedImage}
            uploadingImage={chat.uploadingImage} input={chat.input} setInput={chat.setInput}
            isListening={chat.isListening} toggleVoice={chat.toggleVoice}
            sendMessage={chat.sendMessage} handleImageAttach={chat.handleImageAttach}
            fileInputRef={chat.fileInputRef}
          />
        )}
      </div>

      {selectedTrip && <TripMapViewer trip={selectedTrip} onClose={() => setSelectedTrip(null)} />}
    </div>
  );
}