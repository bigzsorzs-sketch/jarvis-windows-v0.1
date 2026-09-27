/**
 * Jarvis OBD Core
 * Original implementation for standard ELM/STN-style OBD-II command flows.
 * Transport-independent: USB/COM, Bluetooth Classic COM, BLE and Wi-Fi TCP
 * all use the same parsing and diagnostic layer.
 */

export const PIDS = {
  ENGINE_LOAD:    { service: '01', pid: '04', name: 'Engine Load',       unit: '%',    bytes: 1, parse: (a) => (a * 100) / 255 },
  COOLANT_TEMP:   { service: '01', pid: '05', name: 'Coolant Temp',      unit: '°C',   bytes: 1, parse: (a) => a - 40 },
  FUEL_PRESSURE:  { service: '01', pid: '0A', name: 'Fuel Pressure',     unit: 'kPa',  bytes: 1, parse: (a) => a * 3 },
  INTAKE_PRESSURE:{ service: '01', pid: '0B', name: 'Intake Pressure',   unit: 'kPa',  bytes: 1, parse: (a) => a },
  ENGINE_RPM:     { service: '01', pid: '0C', name: 'RPM',               unit: 'rpm',  bytes: 2, parse: (a, b) => ((a * 256) + b) / 4 },
  SPEED:          { service: '01', pid: '0D', name: 'Vehicle Speed',     unit: 'km/h', bytes: 1, parse: (a) => a },
  TIMING_ADVANCE: { service: '01', pid: '0E', name: 'Timing Advance',    unit: '°',    bytes: 1, parse: (a) => (a / 2) - 64 },
  INTAKE_TEMP:    { service: '01', pid: '0F', name: 'Intake Air Temp',   unit: '°C',   bytes: 1, parse: (a) => a - 40 },
  MAF_AIR_FLOW:   { service: '01', pid: '10', name: 'MAF Air Flow',      unit: 'g/s',  bytes: 2, parse: (a, b) => ((a * 256) + b) / 100 },
  THROTTLE_POS:   { service: '01', pid: '11', name: 'Throttle Position', unit: '%',    bytes: 1, parse: (a) => (a * 100) / 255 },
  RUN_TIME:       { service: '01', pid: '1F', name: 'Engine Run Time',   unit: 's',    bytes: 2, parse: (a, b) => (a * 256) + b },
  FUEL_LEVEL:     { service: '01', pid: '2F', name: 'Fuel Level',        unit: '%',    bytes: 1, parse: (a) => (a * 100) / 255 },
  BARO_PRESSURE:  { service: '01', pid: '33', name: 'Barometric Pressure', unit: 'kPa', bytes: 1, parse: (a) => a },
  CONTROL_VOLTAGE:{ service: '01', pid: '42', name: 'Control Voltage',   unit: 'V',    bytes: 2, parse: (a, b) => ((a * 256) + b) / 1000 },
  AMBIENT_TEMP:   { service: '01', pid: '46', name: 'Ambient Temp',      unit: '°C',   bytes: 1, parse: (a) => a - 40 },
};

function hasTransportError(response) {
  return /NO\s*DATA|UNABLE\s*TO\s*CONNECT|BUS\s*ERROR|CAN\s*ERROR|STOPPED|\?/i.test(String(response || ''));
}

function meaningfulObdResponse(command, response) {
  const commandText = String(command || '').toUpperCase().replace(/\s+/g, '');
  return String(response || '')
    .replace(/>/g, '\n')
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.toUpperCase().replace(/\s+/g, '') !== commandText)
    .join(' ')
    .trim();
}

function assertObdResponse(command, response) {
  const text = meaningfulObdResponse(command, response);
  if (!text) throw new Error('OBD_ADAPTER_NO_RESPONSE:' + command);
  if (hasTransportError(text)) throw new Error('OBD_ADAPTER_ERROR:' + text.slice(0, 160));
  return text;
}

export function extractHexBytes(response) {
  const raw = String(response || '').toUpperCase();
  if (!raw || hasTransportError(raw)) return [];
  const lines = raw.replace(/>/g, '\n').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bytes = [];

  for (const line of lines) {
    if (/^(AT|ELM|OBDLINK|STN|SEARCHING|OK)/.test(line)) continue;
    const matches = line.match(/[0-9A-F]{2}/g);
    if (matches) bytes.push(...matches);
  }
  return bytes;
}

export class BaseOBD2Manager {
  constructor() {
    this.isConnected = false;
    this.buffer = '';
    this.messageHandlers = [];
    this.adapterIdentity = '';
    this.protocol = '';
  }

  async connect() { throw new Error('connect() not implemented'); }
  async sendCommand() { throw new Error('sendCommand() not implemented'); }

  async disconnect() {
    this.isConnected = false;
  }

  async initialize() {
    const sequence = [
      { cmd: 'ATZ', desc: 'Reset', wait: 650, timeout: 2600 },
      { cmd: 'ATE0', desc: 'Echo off' },
      { cmd: 'ATL0', desc: 'Linefeeds off' },
      { cmd: 'ATS1', desc: 'Spaces on' },
      { cmd: 'ATH0', desc: 'Headers off' },
      { cmd: 'ATSP0', desc: 'Automatic protocol' },
      { cmd: 'ATI', desc: 'Adapter identity' },
      { cmd: 'ATRV', desc: 'Voltage' },
      { cmd: 'ATDP', desc: 'Protocol' },
    ];

    const results = {};
    for (const item of sequence) {
      const response = await this.sendCommand(item.cmd, item.timeout || 1800);
      const meaningful = assertObdResponse(item.cmd, response);
      results[item.desc] = meaningful;
      if (item.desc === 'Adapter identity') this.adapterIdentity = meaningful;
      if (item.desc === 'Protocol') this.protocol = meaningful;
      await this.delay(item.wait || 80);
    }

    const probeRaw = await this.sendCommand('0100', 2800);
    const probe = assertObdResponse('0100', probeRaw);
    const compact = probe.toUpperCase().replace(/[^0-9A-F]/g, '');
    const ecuConnected = compact.includes('4100');
    return {
      success: true,
      adapterReady: true,
      ecuConnected,
      probe: probe.slice(0, 200),
      results,
      adapterIdentity: this.adapterIdentity,
      protocol: this.protocol
    };
  }

  async query(service, pid = '', timeout = 1800) {
    return this.sendCommand(String(service) + String(pid), timeout);
  }

  async readPID(pidKey) {
    const pid = PIDS[pidKey];
    if (!pid) throw new Error('Ismeretlen PID: ' + pidKey);

    const response = await this.query(pid.service, pid.pid);
    const bytes = extractHexBytes(response);
    const modeReply = (parseInt(pid.service, 16) + 0x40).toString(16).toUpperCase().padStart(2, '0');
    const index = bytes.findIndex((value, i) => value === modeReply && bytes[i + 1] === pid.pid);

    if (index < 0) return null;
    const payload = bytes.slice(index + 2, index + 2 + (pid.bytes || 1)).map((value) => parseInt(value, 16));
    if (payload.length < (pid.bytes || 1) || payload.some(Number.isNaN)) return null;

    return { key: pidKey, name: pid.name, value: pid.parse(...payload), unit: pid.unit };
  }

  async readLiveData(keys = Object.keys(PIDS)) {
    const output = {};
    for (const key of keys) {
      try {
        const reading = await this.readPID(key);
        if (reading) output[key] = reading;
      } catch {
        // Unsupported PIDs are normal and should not abort a live-data sweep.
      }
    }
    return output;
  }

  async readVIN() {
    const response = await this.sendCommand('0902', 3000);
    const bytes = extractHexBytes(response);
    const vinBytes = [];

    for (let i = 0; i < bytes.length - 3; i += 1) {
      if (bytes[i] === '49' && bytes[i + 1] === '02') {
        let cursor = i + 3;
        while (cursor < bytes.length && !(bytes[cursor] === '49' && bytes[cursor + 1] === '02')) {
          vinBytes.push(parseInt(bytes[cursor], 16));
          cursor += 1;
        }
        i = cursor - 1;
      }
    }

    const vin = String.fromCharCode(...vinBytes)
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/\s/g, '')
      .slice(0, 17);
    return vin.length === 17 ? vin : null;
  }

  async readDTCs() {
    const response = await this.sendCommand('03', 2500);
    const bytes = extractHexBytes(response);
    const start = bytes.indexOf('43');
    if (start < 0) return [];

    const codes = [];
    for (let i = start + 1; i + 1 < bytes.length; i += 2) {
      const a = parseInt(bytes[i], 16);
      const b = parseInt(bytes[i + 1], 16);
      if (!Number.isFinite(a) || !Number.isFinite(b) || (a === 0 && b === 0)) break;

      const prefix = ['P', 'C', 'B', 'U'][(a >> 6) & 0x03];
      const firstDigit = (a >> 4) & 0x03;
      const rest = ((a & 0x0F).toString(16) + b.toString(16).padStart(2, '0')).toUpperCase();
      codes.push(prefix + firstDigit + rest);
    }
    return [...new Set(codes)];
  }

  async clearDTCs() {
    const response = await this.sendCommand('04', 2500);
    return /(^|[^0-9A-F])44([^0-9A-F]|$)|OK/i.test(String(response || ''));
  }

  async adapterInfo() {
    const [identity, voltage, protocol] = await Promise.all([
      this.sendCommand('ATI').catch(() => ''),
      this.sendCommand('ATRV').catch(() => ''),
      this.sendCommand('ATDP').catch(() => ''),
    ]);
    return {
      identity: String(identity).replace(/[>\r\n]/g, ' ').trim(),
      voltage: String(voltage).replace(/[>\r\n]/g, ' ').trim(),
      protocol: String(protocol).replace(/[>\r\n]/g, ' ').trim(),
    };
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  onDataReceived(event) {
    const data = new TextDecoder().decode(event.target.value);
    this.buffer += data;
    this.messageHandlers.forEach((handler) => handler(this.buffer));
  }

  onDisconnect() {
    this.isConnected = false;
  }
}

export default BaseOBD2Manager;
