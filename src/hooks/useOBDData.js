import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for managing OBD2 connection lifecycle and data.
 * v0.5 adds native Windows USB port discovery and connection health checks.
 */
export function useOBDData() {
  const [obd2Manager, setObd2Manager] = useState(null);
  const [obd2Status, setObd2Status] = useState(null);
  const [obd2Connecting, setObd2Connecting] = useState(false);
  const [usbPorts, setUsbPorts] = useState([]);
  const [connectionMeta, setConnectionMeta] = useState(null);

  const listUSBPorts = useCallback(async () => {
    try {
      const { USBOBDManager } = await import('@/lib/obd2/USBOBDManager');
      const manager = new USBOBDManager();
      const ports = await manager.listPorts();
      setUsbPorts(ports);
      return ports;
    } catch (error) {
      console.error('USB OBD port discovery failed:', error);
      setUsbPorts([]);
      return [];
    }
  }, []);

  const connect = useCallback(async (adapterType, wifiIP, usbPort) => {
    setObd2Connecting(true);
    setObd2Status('Csatlakozás...');
    try {
      let manager;
      let connectResult;
      const { default: OBD2Manager } = await import('@/lib/obd2Manager');
      const { WiFiOBD2Manager } = await import('@/lib/obd2/WiFiOBD2Manager');
      const { USBOBDManager } = await import('@/lib/obd2/USBOBDManager');
      const { STN1110Manager } = await import('@/lib/obd2/STN1110Manager');
      const { HSCANManager } = await import('@/lib/obd2/HSCANManager');

      switch (adapterType) {
        case 'wifi':
          manager = new WiFiOBD2Manager();
          connectResult = await manager.connect('http://' + wifiIP);
          break;
        case 'usb':
          manager = new USBOBDManager();
          connectResult = await manager.connect(usbPort || null);
          break;
        case 'stn1110':
          manager = new STN1110Manager();
          connectResult = await manager.connect();
          break;
        case 'hscan':
          manager = new HSCANManager();
          connectResult = await manager.connect();
          break;
        default:
          manager = new OBD2Manager();
          connectResult = await manager.connect();
      }

      if (connectResult?.success === false) {
        throw new Error(connectResult.error || 'OBD_CONNECTION_FAILED');
      }

      setObd2Status('Inicializálás...');
      const initResult = await manager.initialize();
      if (!initResult?.success) throw new Error(initResult?.error || 'OBD_INITIALIZATION_FAILED');

      setObd2Manager(manager);
      setConnectionMeta({
        adapterType,
        device: connectResult?.device || null,
        port: connectResult?.port || null,
        baudRate: connectResult?.baudRate || null,
        adapterInfo: initResult?.adapterInfo || connectResult?.adapterInfo || null,
        supportedPids: manager.supportedPidHex ? [...manager.supportedPidHex] : [],
      });
      setObd2Status('✅ Csatlakoztatva!');
      setObd2Connecting(false);
      return manager;
    } catch (error) {
      console.error('OBD2 connection error:', error);
      if (Array.isArray(error?.availablePorts)) {
        setUsbPorts(error.availablePorts);
        setObd2Status('❌ Több COM port található. Válaszd ki az OBD adapter portját.');
      } else if (String(error?.message || '').includes('NO_SERIAL_PORTS_FOUND')) {
        setObd2Status('❌ Nem találok USB/COM soros eszközt.');
      } else if (String(error?.message || '').includes('USB_PORT_REQUIRED')) {
        setObd2Status('❌ Válaszd ki az OBD adapter COM portját.');
      } else {
        setObd2Status('❌ Nem sikerült csatlakozni az OBD2 eszközhöz.');
      }
      setObd2Connecting(false);
      setObd2Manager(null);
      setConnectionMeta(null);
      throw error;
    }
  }, []);

  const disconnect = useCallback(async (manager) => {
    if (manager) {
      await manager.disconnect();
    }
    setObd2Manager(null);
    setConnectionMeta(null);
    setObd2Status(null);
  }, []);

  // Lightweight health check for transports that can report status.
  useEffect(() => {
    if (!obd2Manager?.getConnectionStatus) return undefined;

    const timer = window.setInterval(async () => {
      try {
        const status = await obd2Manager.getConnectionStatus();
        if (status?.connected === false) {
          setObd2Status('❌ Az OBD kapcsolat megszakadt.');
          setObd2Manager(null);
          setConnectionMeta(null);
        }
      } catch {
        // Do not tear down on a single status-check failure.
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [obd2Manager]);

  return {
    obd2Manager,
    obd2Status,
    obd2Connecting,
    usbPorts,
    connectionMeta,
    listUSBPorts,
    connect,
    disconnect,
  };
}
