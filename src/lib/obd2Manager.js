import { BaseOBD2Manager } from './obd2/BaseOBD2Manager.js';

const OBD2_CHARACTERISTICS = {
  RX_CHARACTERISTIC: '0000ffe1-0000-1000-8000-00805f9b34fb',
  SPP_SERVICE: '0000110e-0000-1000-8000-00805f9b34fb',
};

/**
 * OBD2Manager - ELM327 Bluetooth adapter (WebBluetooth API)
 * Extends BaseOBD2Manager for shared AT/PID/DTC logic.
 */
export class OBD2Manager extends BaseOBD2Manager {
  constructor() {
    super();
    this.device = null;
    this.server = null;
    this.service = null;
    this.characteristic = null;
  }

  async connect() {
    this.device = await navigator.bluetooth.requestDevice({
      filters: [
        { name: 'ELM327' },
        { namePrefix: 'OBD' },
        { services: [OBD2_CHARACTERISTICS.SPP_SERVICE] }
      ],
      optionalServices: [OBD2_CHARACTERISTICS.SPP_SERVICE]
    });

    this.device.addEventListener('gattserverdisconnected', () => this.onDisconnect());
    this.server = await this.device.gatt.connect();
    this.service = await this.server.getPrimaryService(OBD2_CHARACTERISTICS.SPP_SERVICE);
    this.characteristic = await this.service.getCharacteristic(OBD2_CHARACTERISTICS.RX_CHARACTERISTIC);
    await this.characteristic.startNotifications();
    this.characteristic.addEventListener('characteristicvaluechanged', (e) => this.onDataReceived(e));
    this.isConnected = true;
    return { success: true, device: this.device.name };
  }

  async sendCommand(cmd, timeout = 1000) {
    if (!this.isConnected) throw new Error('Nincs Bluetooth kapcsolat');
    this.buffer = '';
    await this.characteristic.writeValue(new TextEncoder().encode(cmd + '\r'));
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(this.buffer), timeout);
      const handler = (msg) => {
        if (msg.includes('>')) {
          clearTimeout(timer);
          this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
          resolve(this.buffer);
        }
      };
      this.messageHandlers.push(handler);
    });
  }

  async disconnect() {
    if (this.device?.gatt?.connected) {
      await this.device.gatt.disconnect();
    }
    await super.disconnect();
  }
}

export default OBD2Manager;