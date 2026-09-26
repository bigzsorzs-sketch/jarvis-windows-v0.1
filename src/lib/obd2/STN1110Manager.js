/**
 * STN1110 Manager - Professzionális OBD2 adapter
 * STN specifikus P1.x parancsok támogatása
 */

export class STN1110Manager {
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
      // STN1110 Bluetooth keresése
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { name: 'STN1110' },
          { namePrefix: 'STN' },
          { services: ['0000ffe0-0000-1000-8000-00805f9b34fb'] }
        ],
        optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb']
      });

      this.device.addEventListener('gattserverdisconnected', () => this.onDisconnect());

      this.server = await this.device.gatt.connect();
      this.service = await this.server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
      this.characteristic = await this.service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');

      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', (e) => this.onDataReceived(e));

      this.isConnected = true;
      return { success: true, device: this.device.name };
    } catch (error) {
      console.error('❌ STN1110 csatlakozási hiba:', error);
      return { success: false, error: 'A STN1110 adapterhez most nem tudtunk csatlakozni. Ellenőrizd, hogy az eszköz be van-e kapcsolva és elérhető-e.' };
    }
  }

  async initialize() {
    const commands = [
      { cmd: 'AT Z', desc: 'Reset' },
      { cmd: 'AT E0', desc: 'Echo off' },
      { cmd: 'AT SP 0', desc: 'Auto protokoll' },
      { cmd: 'AT H1', desc: 'Headers ON (STN specifikus)' },
      { cmd: 'AT D1', desc: 'Display Data (STN specifikus)' },
    ];

    const results = {};
    for (const { cmd, desc } of commands) {
      const response = await this.sendCommand(cmd);
      results[desc] = response;
      await this.delay(100);
    }

    return { success: true, results };
  }

  async sendCommand(cmd, timeout = 1000) {
    if (!this.isConnected) throw new Error('Nincs Bluetooth kapcsolat');

    this.buffer = '';
    const data = new TextEncoder().encode(cmd + '\r');
    
    await this.characteristic.writeValue(data);
    
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        console.warn(`⏱️ Timeout: ${cmd}`);
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

  // STN specifikus P1 parancsok
  async readAdvancedDiagnostics() {
    const response = await this.sendCommand('P1 00'); // STN diagnostic mode
    return response;
  }

  async readDTCs() {
    const response = await this.sendCommand('03');
    const codes = [];
    const pairs = response.split(' ').slice(1);
    
    for (let i = 0; i < pairs.length; i += 2) {
      const a = parseInt(pairs[i], 16);
      const b = parseInt(pairs[i + 1], 16);
      if (a === 0 && b === 0) break;
      
      const type = String.fromCharCode(64 + Math.floor(a / 64));
      const code = String(((a % 64) * 256 + b).toString().padStart(4, '0'));
      codes.push(`${type}${code}`);
    }
    
    return codes;
  }

  async clearDTCs() {
    const response = await this.sendCommand('04');
    return response.includes('OK');
  }

  onDataReceived(event) {
    const data = new TextDecoder().decode(event.target.value);
    this.buffer += data;
    this.messageHandlers.forEach(handler => handler(this.buffer));
  }

  onDisconnect() {
    this.isConnected = false;
    console.log('🔌 STN1110 lecsatlakoztatva');
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

export default STN1110Manager;