import { BaseOBD2Manager } from './BaseOBD2Manager.js';

/**
 * USBOBDManager - ELM327 USB (backend bridge via serialport)
 * Extends BaseOBD2Manager for shared AT/PID/DTC logic.
 */
export class USBOBDManager extends BaseOBD2Manager {
  constructor() {
    super();
    this.portName = null;
  }

  async connect(portName = '/dev/ttyUSB0') {
    this.portName = portName;
    const response = await fetch('/api/obd2/usb-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port: portName, baudrate: 38400 })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    this.isConnected = true;
    return { success: true, device: `USB OBD2 (${portName})` };
  }

  async sendCommand(cmd, timeout = 1000) {
    if (!this.isConnected) throw new Error('Nincs USB kapcsolat');
    const response = await fetch('/api/obd2/usb-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd, timeout })
    });
    const data = await response.json();
    return data.response || '';
  }

  async disconnect() {
    await fetch('/api/obd2/usb-disconnect', { method: 'POST' });
    await super.disconnect();
  }
}

export default USBOBDManager;