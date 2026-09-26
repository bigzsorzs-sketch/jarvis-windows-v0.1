import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for managing OBD2 connection lifecycle and data.
 */
export function useOBDData() {
  const [obd2Manager, setObd2Manager] = useState(null);
  const [obd2Status, setObd2Status] = useState(null);
  const [obd2Connecting, setObd2Connecting] = useState(false);

  const connect = useCallback(async (adapterType, wifiIP, usbPort) => {
    setObd2Connecting(true);
    setObd2Status('Csatlakozás...');
    try {
      let manager;
      const { default: OBD2Manager } = await import('@/lib/obd2Manager');
      const { WiFiOBD2Manager } = await import('@/lib/obd2/WiFiOBD2Manager');
      const { USBOBDManager } = await import('@/lib/obd2/USBOBDManager');
      const { STN1110Manager } = await import('@/lib/obd2/STN1110Manager');
      const { HSCANManager } = await import('@/lib/obd2/HSCANManager');

      switch (adapterType) {
        case 'wifi':   manager = new WiFiOBD2Manager(); await manager.connect(`http://${wifiIP}`); break;
        case 'usb':    manager = new USBOBDManager();   await manager.connect(usbPort); break;
        case 'stn1110':manager = new STN1110Manager();  await manager.connect(); break;
        case 'hscan':  manager = new HSCANManager();    await manager.connect(); break;
        default:       manager = new OBD2Manager();     await manager.connect();
      }

      setObd2Status('Inicializálás...');
      const initResult = await manager.initialize();
      if (!initResult.success) throw new Error(initResult.error);

      setObd2Manager(manager);
      setObd2Status('✅ Csatlakoztatva!');
      setTimeout(() => setObd2Connecting(false), 1000);
      return manager;
    } catch (error) {
      console.error('OBD2 connection error:', error);
      setObd2Status('❌ Nem sikerült csatlakozni az OBD2 eszközhöz.');
      setObd2Connecting(false);
      throw error;
    }
  }, []);

  const disconnect = useCallback(async (manager) => {
    if (manager) {
      await manager.disconnect();
      setObd2Manager(null);
      setObd2Status(null);
    }
  }, []);

  return { obd2Manager, obd2Status, obd2Connecting, connect, disconnect };
}