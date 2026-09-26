import { BaseOBD2Manager } from './obd2/BaseOBD2Manager.js';

const BLE_PROFILES = [
  {
    name: 'OBDLink CX / FFF0 UART',
    service: '0000fff0-0000-1000-8000-00805f9b34fb',
    write: '0000fff1-0000-1000-8000-00805f9b34fb',
    notify: '0000fff1-0000-1000-8000-00805f9b34fb',
  },
  {
    name: 'Generic ELM327 FFE0',
    service: '0000ffe0-0000-1000-8000-00805f9b34fb',
    write: '0000ffe1-0000-1000-8000-00805f9b34fb',
    notify: '0000ffe1-0000-1000-8000-00805f9b34fb',
  },
  {
    name: 'Nordic UART',
    service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    write: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    notify: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  },
];

export class OBD2Manager extends BaseOBD2Manager {
  constructor() {
    super();
    this.device = null;
    this.server = null;
    this.service = null;
    this.writeCharacteristic = null;
    this.notifyCharacteristic = null;
    this.profile = null;
  }

  async connect() {
    if (!navigator.bluetooth) throw new Error('WEB_BLUETOOTH_UNAVAILABLE');

    this.device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        ...BLE_PROFILES.map((profile) => profile.service),
        '0000180a-0000-1000-8000-00805f9b34fb',
      ],
    });

    this.device.addEventListener('gattserverdisconnected', () => this.onDisconnect());
    this.server = await this.device.gatt.connect();

    let lastError;
    for (const profile of BLE_PROFILES) {
      try {
        const service = await this.server.getPrimaryService(profile.service);
        const writeCharacteristic = await service.getCharacteristic(profile.write);
        const notifyCharacteristic = profile.notify === profile.write
          ? writeCharacteristic
          : await service.getCharacteristic(profile.notify);

        await notifyCharacteristic.startNotifications();
        notifyCharacteristic.addEventListener('characteristicvaluechanged', (event) => this.onDataReceived(event));

        this.service = service;
        this.writeCharacteristic = writeCharacteristic;
        this.notifyCharacteristic = notifyCharacteristic;
        this.profile = profile;
        this.isConnected = true;

        return {
          success: true,
          device: this.device.name || 'Bluetooth LE OBD2',
          profile: profile.name,
        };
      } catch (error) {
        lastError = error;
      }
    }

    await this.disconnect();
    throw lastError || new Error('BLE_OBD_PROFILE_NOT_SUPPORTED');
  }

  async writeBytes(bytes) {
    const characteristic = this.writeCharacteristic;
    if (!characteristic) throw new Error('BLE_OBD_NOT_CONNECTED');
    if (characteristic.properties?.writeWithoutResponse && characteristic.writeValueWithoutResponse) {
      return characteristic.writeValueWithoutResponse(bytes);
    }
    if (characteristic.writeValueWithResponse) return characteristic.writeValueWithResponse(bytes);
    return characteristic.writeValue(bytes);
  }

  async sendCommand(command, timeout = 1800) {
    if (!this.isConnected) throw new Error('Nincs Bluetooth LE kapcsolat');
    this.buffer = '';

    const bytes = new TextEncoder().encode(String(command).trim() + '\r');
    await this.writeBytes(bytes);

    return new Promise((resolve) => {
      const onMessage = (message) => {
        if (message.includes('>')) {
          clearTimeout(timer);
          this.messageHandlers = this.messageHandlers.filter((handler) => handler !== onMessage);
          resolve(this.buffer);
        }
      };
      const timer = setTimeout(() => {
        this.messageHandlers = this.messageHandlers.filter((handler) => handler !== onMessage);
        resolve(this.buffer);
      }, timeout);
      this.messageHandlers.push(onMessage);
    });
  }

  async disconnect() {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.writeCharacteristic = null;
    this.notifyCharacteristic = null;
    this.service = null;
    this.profile = null;
    await super.disconnect();
  }
}

export default OBD2Manager;
