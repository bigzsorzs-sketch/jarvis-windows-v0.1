import { useState, useEffect, useCallback } from 'react';

export function useOBDData() {
  const [obd2Manager, setObd2Manager] = useState(null);
  const [obd2Status, setObd2Status] = useState(null);
  const [obd2Connecting, setObd2Connecting] = useState(false);
  const [serialPorts, setSerialPorts] = useState([]);

  const refreshSerialPorts = useCallback(async () => {
    try {
      const { DesktopOBDManager } = await import('@/lib/obd2/DesktopOBDManager');
      const ports = await DesktopOBDManager.listPorts();
      setSerialPorts(ports);
      return ports;
    } catch {
      setSerialPorts([]);
      return [];
    }
  }, []);

  useEffect(() => {
    refreshSerialPorts();
  }, [refreshSerialPorts]);

  const connect = useCallback(async (adapterType, wifiAddress, serialPort) => {
    setObd2Connecting(true);
    setObd2Status('Csatlakozás...');

    try {
      let manager;
      const { default: BLEOBDManager } = await import('@/lib/obd2Manager');
      const { DesktopOBDManager } = await import('@/lib/obd2/DesktopOBDManager');

      switch (adapterType) {
        case 'wifi':
          manager = new DesktopOBDManager('wifi', { address: wifiAddress });
          break;
        case 'usb':
        case 'bluetooth-classic':
          manager = new DesktopOBDManager('serial', { path: serialPort, baudRate: 38400 });
          break;
        case 'bluetooth-le':
          manager = new BLEOBDManager();
          break;
        case 'auto':
        default: {
          const ports = await refreshSerialPorts();
          const candidate = ports.find((port) => port.score > 0) || (ports.length === 1 ? ports[0] : null);
          manager = candidate
            ? new DesktopOBDManager('serial', { path: candidate.path, baudRate: 38400 })
            : new BLEOBDManager();
          break;
        }
      }

      const connection = await manager.connect();
      setObd2Status('Inicializálás: ' + (connection.device || 'OBD2') + '...');

      const initResult = await manager.initialize();
      if (!initResult.success) throw new Error(initResult.error);

      setObd2Manager(manager);
      const identity = initResult.adapterIdentity ? ' · ' + initResult.adapterIdentity : '';
      setObd2Status('✅ Csatlakoztatva' + identity);
      setObd2Connecting(false);
      return manager;
    } catch (error) {
      console.error('OBD2 connection error:', error);
      const message = error?.message === 'OBD_SERIAL_PORT_REQUIRED'
        ? 'Válaszd ki az OBD adapter COM portját.'
        : 'Nem sikerült csatlakozni az OBD2 eszközhöz.';
      setObd2Status('❌ ' + message);
      setObd2Connecting(false);
      throw error;
    }
  }, [refreshSerialPorts]);

  const disconnect = useCallback(async (manager) => {
    if (manager) await manager.disconnect();
    setObd2Manager(null);
    setObd2Status(null);
  }, []);

  return {
    obd2Manager,
    obd2Status,
    obd2Connecting,
    serialPorts,
    refreshSerialPorts,
    connect,
    disconnect,
  };
}
