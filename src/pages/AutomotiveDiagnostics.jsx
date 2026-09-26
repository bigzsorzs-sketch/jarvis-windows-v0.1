import { useState } from 'react';
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

const TUTORIAL_STEPS = [
  { icon: '🚗', title: 'Autó diagnosztika', description: 'Tartsd nyomon a járműveidet: VIN, motor típus, kilométerállapot.', hint: 'Minden járműnek saját diagnosztikai előzménye van' },
  { icon: '🔧', title: 'OBD2 csatornák', description: 'Az AI OBD2 adatok alapján diagnosztizálja az autót és becsüli a javítás költségét.', hint: 'Összekötés OBD2 adapterrel szükséges a teljes funkcionalitáshoz' },
  { icon: '📋', title: 'Kezdj el!', description: 'Add hozzá az első járművedet a VIN vagy manuális adatokkal.', hint: 'A VIN 17 karakteres azonosító az autó ablakán' },
];

export default function AutomotiveDiagnostics() {
  const [adapterType, setAdapterType] = useState('bluetooth-elm327');
  const [wifiIP, setWifiIP] = useState('192.168.0.10:35000');
  const [usbPort, setUsbPort] = useState('/dev/ttyUSB0');
  const [viewMode, setViewMode] = useState('chat');
  const [vehicleProfile, setVehicleProfile] = useState(null);

  const { obd2Manager, obd2Status, obd2Connecting, connect: connectOBDHook, disconnect: disconnectOBDHook } = useOBDData();

  const chat = useAutomotiveChat();
  const { isRecordingTrip, selectedTrip, setSelectedTrip, toggleTripRecording } = useTripLogic(chat.addMessage);
  const { pdfLoading, generatePDF } = useAutomotivePDF(chat.lastDiagnosis, chat.lastParts, vehicleProfile, chat.addMessage);

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