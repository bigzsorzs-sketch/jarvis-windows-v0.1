import { BaseOBD2Manager } from './BaseOBD2Manager.js';

/**
 * Native USB OBD manager for Jarvis Desktop.
 *
 * Uses the isolated Electron preload bridge instead of non-existent HTTP endpoints.
 * This is the preferred Windows workshop transport for supported USB ELM/STN adapters.
 */
export class USBOBDManager extends BaseOBD2Manager {
  constructor() {
    super();
    this.portName = null;
    this.baudRate = null;
    this.availablePorts = [];
  }

  get bridge() {
    return typeof window !== 'undefined' ? window.jarvisDesktop : null;
  }

  async listPorts() {
    if (!this.bridge?.listOBDSerialPorts) throw new Error('NATIVE_SERIAL_BRIDGE_UNAVAILABLE');
    const ports = await this.bridge.listOBDSerialPorts();
    this.availablePorts = Array.isArray(ports) ? ports : [];
    return this.availablePorts;
  }

  async connect(portName = null, preferredBaudRate = null) {
    if (!this.bridge?.connectOBDSerial || !this.bridge?.sendOBDSerial) {
      throw new Error('NATIVE_SERIAL_BRIDGE_UNAVAILABLE');
    }

    const ports = await this.listPorts();
    let selected = portName?.trim();

    if (!selected) {
      if (ports.length === 1) selected = ports[0].path;
      else if (ports.length === 0) throw new Error('NO_SERIAL_PORTS_FOUND');
      else {
        const error = new Error('USB_PORT_REQUIRED');
        error.availablePorts = ports;
        throw error;
      }
    }

    if (!ports.some((item) => item.path === selected)) {
      throw new Error('USB_PORT_NOT_FOUND:' + selected);
    }

    const baudCandidates = preferredBaudRate
      ? [Number(preferredBaudRate)]
      : [115200, 38400, 9600];

    let lastError = null;
    for (const baudRate of baudCandidates) {
      try {
        await this.bridge.connectOBDSerial({ path: selected, baudRate });
        const probe = await this.bridge.sendOBDSerial({ command: 'ATI', timeout: 1400 });
        const text = String(probe || '').toUpperCase();

        if (text.trim() && !text.includes('UNABLE') && !text.includes('ERROR')) {
          this.portName = selected;
          this.baudRate = baudRate;
          this.isConnected = true;
          this.adapterInfo = this.normalizeResponse(probe, 'ATI');
          return {
            success: true,
            device: 'USB OBD2 (' + selected + ')',
            port: selected,
            baudRate,
            adapterInfo: this.adapterInfo,
          };
        }

        lastError = new Error('OBD_ADAPTER_NO_IDENTITY_RESPONSE');
      } catch (error) {
        lastError = error;
      }

      await this.bridge.disconnectOBDSerial?.().catch(() => {});
    }

    throw lastError || new Error('USB_OBD_CONNECTION_FAILED');
  }

  async sendCommand(cmd, timeout = 1500) {
    if (!this.isConnected) throw new Error('Nincs USB OBD kapcsolat');
    if (!this.bridge?.sendOBDSerial) throw new Error('NATIVE_SERIAL_BRIDGE_UNAVAILABLE');
    return this.bridge.sendOBDSerial({ command: cmd, timeout });
  }

  async getConnectionStatus() {
    if (!this.bridge?.getOBDSerialStatus) {
      return { connected: this.isConnected, path: this.portName, baudRate: this.baudRate };
    }
    return this.bridge.getOBDSerialStatus();
  }

  async disconnect() {
    try {
      await this.bridge?.disconnectOBDSerial?.();
    } finally {
      this.portName = null;
      this.baudRate = null;
      await super.disconnect();
    }
  }
}

export default USBOBDManager;
