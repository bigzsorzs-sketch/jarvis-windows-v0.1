/**
 * BaseOBD2Manager - Közös alaposztály minden OBD2 adapter típushoz.
 * Egységesíti a connect/disconnect/initialize/readPID/readDTCs/clearDTCs interfészt.
 */

export const PIDS = {
  ENGINE_RPM:   { service: '01', pid: '0C', name: 'RPM',              unit: 'rpm',  parse: (a, b) => ((a * 256) + b) / 4 },
  COOLANT_TEMP: { service: '01', pid: '05', name: 'Coolant Temp',     unit: '°C',   parse: (a) => a - 40 },
  MAF_AIR_FLOW: { service: '01', pid: '10', name: 'MAF Air Flow',     unit: 'g/s',  parse: (a, b) => ((a * 256) + b) / 100 },
  FUEL_PRESSURE:{ service: '01', pid: '0A', name: 'Fuel Pressure',    unit: 'kPa',  parse: (a) => a * 3 },
  SPEED:        { service: '01', pid: '0D', name: 'Vehicle Speed',    unit: 'km/h', parse: (a) => a },
  THROTTLE_POS: { service: '01', pid: '11', name: 'Throttle Position',unit: '%',    parse: (a) => (a / 255) * 100 },
};

export class BaseOBD2Manager {
  constructor() {
    this.isConnected = false;
    this.buffer = '';
    this.messageHandlers = [];
  }

  // ─── Abstract – subclasses must implement ────────────────────────────────
  async connect()              { throw new Error('connect() not implemented'); }
  async sendCommand(cmd, timeout = 1000) { throw new Error('sendCommand() not implemented'); }
  async disconnect() {
    this.isConnected = false;
  }

  // ─── Shared initialization (AT commands) ─────────────────────────────────
  async initialize() {
    const commands = [
      { cmd: 'AT Z',  desc: 'Reset' },
      { cmd: 'AT E0', desc: 'Echo off' },
      { cmd: 'AT S0', desc: 'Space off' },
      { cmd: 'AT L0', desc: 'Linefeeds off' },
      { cmd: 'AT SP 0', desc: 'Auto protokoll' },
      { cmd: 'RV',    desc: 'Voltage check' },
    ];

    const results = {};
    for (const { cmd, desc } of commands) {
      const response = await this.sendCommand(cmd);
      results[desc] = response;
      if (desc === 'Voltage check' && response.includes('UNABLE')) {
        return { success: false, error: 'ELM327 klón vagy hibás – feszültség nem olvasható' };
      }
      await this.delay(100);
    }
    return { success: true, results };
  }

  // ─── Shared PID reading ───────────────────────────────────────────────────
  async readPID(pidKey) {
    const pid = PIDS[pidKey];
    if (!pid) throw new Error(`Ismeretlen PID: ${pidKey}`);
    const response = await this.sendCommand(pid.service + pid.pid);
    const values = response.split(' ').slice(2);
    if (values.length < 1) return null;
    const parsed = pid.parse(...values.map(v => parseInt(v, 16)));
    return { name: pid.name, value: parsed, unit: pid.unit };
  }

  // ─── Shared VIN reading ───────────────────────────────────────────────────
  async readVIN() {
    const response = await this.sendCommand('0902');
    const vin = response.replace(/[^A-Z0-9]/g, '').substring(0, 17);
    return vin.length === 17 ? vin : null;
  }

  // ─── Shared DTC reading ───────────────────────────────────────────────────
  async readDTCs() {
    const response = await this.sendCommand('03');
    const codes = [];
    const pairs = response.split(' ').slice(1);
    for (let i = 0; i < pairs.length - 1; i += 2) {
      const a = parseInt(pairs[i], 16);
      const b = parseInt(pairs[i + 1], 16);
      if (a === 0 && b === 0) break;
      const type = String.fromCharCode(64 + Math.floor(a / 64));
      const code = String(((a % 64) * 256 + b).toString().padStart(4, '0'));
      codes.push(`${type}${code}`);
    }
    return codes;
  }

  // ─── Shared DTC clear ────────────────────────────────────────────────────
  async clearDTCs() {
    const response = await this.sendCommand('04');
    return response.includes('OK');
  }

  // ─── Utility ─────────────────────────────────────────────────────────────
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  onDataReceived(event) {
    const data = new TextDecoder().decode(event.target.value);
    this.buffer += data;
    this.messageHandlers.forEach(handler => handler(this.buffer));
  }

  onDisconnect() {
    this.isConnected = false;
  }
}

export default BaseOBD2Manager;