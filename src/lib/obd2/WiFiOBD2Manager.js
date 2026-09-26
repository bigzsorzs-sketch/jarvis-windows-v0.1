import { BaseOBD2Manager } from './BaseOBD2Manager.js';

/**
 * WiFiOBD2Manager - Vgate iCar Pro, OBDLink MX+ támogatás (HTTP/WebSocket)
 * Extends BaseOBD2Manager for shared AT/PID/DTC logic.
 */
export class WiFiOBD2Manager extends BaseOBD2Manager {
  constructor() {
    super();
    this.baseURL = null;
    this.ws = null;
  }

  async connect(ipAddress = 'http://192.168.0.10:35000') {
    this.baseURL = ipAddress;
    const response = await fetch(`${this.baseURL}/status`);
    if (!response.ok) throw new Error('WiFi OBD2 adapter nem válaszol');

    try {
      this.ws = new WebSocket(`ws://${ipAddress.replace('http://', '')}`);
      this.ws.onmessage = (e) => { this.buffer += e.data; this.messageHandlers.forEach(h => h(this.buffer)); };
      this.ws.onerror = () => console.warn('WebSocket fallback to HTTP');
    } catch {
      console.log('WebSocket nem elérhető, HTTP polling');
    }

    this.isConnected = true;
    return { success: true, device: `WiFi OBD2 (${ipAddress})` };
  }

  async sendCommand(cmd) {
    if (!this.isConnected) throw new Error('Nincs WiFi kapcsolat');
    const response = await fetch(`${this.baseURL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd + '\r' })
    });
    const data = await response.json();
    return data.response || '';
  }

  async disconnect() {
    if (this.ws) this.ws.close();
    await super.disconnect();
  }
}

export default WiFiOBD2Manager;