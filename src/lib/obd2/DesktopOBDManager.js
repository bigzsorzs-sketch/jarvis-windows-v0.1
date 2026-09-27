import { BaseOBD2Manager } from './BaseOBD2Manager.js';

function desktopBridge() {
  const bridge = window.jarvisDesktop?.obd;
  if (!bridge) throw new Error('JARVIS_DESKTOP_OBD_UNAVAILABLE');
  return bridge;
}

export class DesktopOBDManager extends BaseOBD2Manager {
  constructor(transport, options = {}) {
    super();
    this.transport = transport;
    this.options = options;
    this.deviceName = '';
  }

  static async listPorts() {
    if (!window.jarvisDesktop?.obd?.listPorts) return [];
    return window.jarvisDesktop.obd.listPorts();
  }

  async connect() {
    const bridge = desktopBridge();

    if (this.transport === 'wifi') {
      const result = await bridge.connect({
        type: 'wifi',
        address: this.options.address || '192.168.0.10:35000',
      });
      if (!result?.success || result.adapterReady !== true) throw new Error('OBD_ADAPTER_NOT_READY');
      if (!result?.success || result.adapterReady !== true) throw new Error('OBD_ADAPTER_NOT_READY');
      this.deviceName = result.device;
      this.isConnected = true;
      return result;
    }

    let portPath = this.options.path;
    if (!portPath) {
      const ports = await DesktopOBDManager.listPorts();
      const recommended = ports.find((port) => port.score > 0);
      if (recommended) portPath = recommended.path;
      else if (ports.length === 1) portPath = ports[0].path;
      else throw new Error('OBD_SERIAL_PORT_REQUIRED');
    }

    const result = await bridge.connect({
      type: 'serial',
      path: portPath,
      baudRate: this.options.baudRate || 38400,
    });
    this.deviceName = result.device;
    this.isConnected = true;
    return result;
  }

  async sendCommand(command, timeout = 1800) {
    if (!this.isConnected) throw new Error('OBD_NOT_CONNECTED');
    return desktopBridge().send(command, timeout);
  }

  async disconnect() {
    await window.jarvisDesktop?.obd?.disconnect?.();
    this.isConnected = false;
  }
}

export default DesktopOBDManager;
