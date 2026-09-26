/**
 * HS-CAN Manager - High-Speed CAN (2010+ járművek)
 * Magasabb bitrate, modern ECU kommunikáció
 */

export class HSCANManager {
  constructor() {
    this.device = null;
    this.server = null;
    this.service = null;
    this.characteristic = null;
    this.isConnected = false;
    this.buffer = '';
    this.messageHandlers = [];
  }

  async connect() {
    try {
      // HS-CAN adapter keresése (általában CAN-USB vagy Bluetooth CAN interfész)
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'HS-CAN' },
          { namePrefix: 'CAN-' },
          { services: ['0000fff0-0000-1000-8000-00805f9b34fb'] }
        ],
        optionalServices: ['0000fff0-0000-1000-8000-00805f9b34fb']
      });

      this.device.addEventListener('gattserverdisconnected', () => this.onDisconnect());

      this.server = await this.device.gatt.connect();
      this.service = await this.server.getPrimaryService('0000fff0-0000-1000-8000-00805f9b34fb');
      this.characteristic = await this.service.getCharacteristic('0000fff1-0000-1000-8000-00805f9b34fb');

      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', (e) => this.onDataReceived(e));

      this.isConnected = true;
      return { success: true, device: this.device.name };
    } catch (error) {
      console.error('❌ HS-CAN csatlakozási hiba:', error);
      return { success: false, error: 'A HS-CAN adapterhez most nem tudtunk csatlakozni. Ellenőrizd, hogy az eszköz be van-e kapcsolva és elérhető-e.' };
    }
  }

  async initialize() {
    const commands = [
      { cmd: 'AT Z', desc: 'Reset' },
      { cmd: 'AT E0', desc: 'Echo off' },
      { cmd: 'AT S6', desc: 'HS-CAN mode (500 kbps)' },
      { cmd: 'AT SP 6', desc: 'Set HS-CAN protokoll' },
    ];

    const results = {};
    for (const { cmd, desc } of commands) {
      const response = await this.sendCommand(cmd);
      results[desc] = response;
      await this.delay(100);
    }

    return { success: true, results };
  }

  async sendCommand(cmd, timeout = 1500) {
    if (!this.isConnected) throw new Error('Nincs HS-CAN kapcsolat');

    this.buffer = '';
    const data = new TextEncoder().encode(cmd + '\r');
    
    await this.characteristic.writeValue(data);
    
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        console.warn(`⏱️ HS-CAN Timeout: ${cmd}`);
        resolve(this.buffer);
      }, timeout);

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

  // Modern CAN adatok (2010+)
  async readModernDiagnostics() {
    // Extended DIDs modern járművekhez
    const response = await this.sendCommand('221234'); // Example DID
    return response;
  }

  async readDTCs() {
    const response = await this.sendCommand('19 02 F1'); // UDS protokoll
    const codes = [];
    
    // UDS formátumban más a válasz mint OBD2
    const bytes = response.match(/[0-9A-F]{2}/gi) || [];
    for (let i = 2; i < bytes.length; i += 2) {
      const code = `${bytes[i]}${bytes[i + 1]}`;
      if (code !== '0000') codes.push(code);
    }
    
    return codes;
  }

  async clearDTCs() {
    const response = await this.sendCommand('14 FF 00'); // UDS clear
    return response.includes('7E');
  }

  onDataReceived(event) {
    const data = new TextDecoder().decode(event.target.value);
    this.buffer += data;
    this.messageHandlers.forEach(handler => handler(this.buffer));
  }

  onDisconnect() {
    this.isConnected = false;
    console.log('🔌 HS-CAN lecsatlakoztatva');
  }

  async disconnect() {
    if (this.device?.gatt?.connected) {
      await this.device.gatt.disconnect();
    }
    this.isConnected = false;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default HSCANManager;