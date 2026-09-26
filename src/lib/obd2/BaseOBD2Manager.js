/**
 * BaseOBD2Manager - shared ELM/STN OBD-II logic.
 *
 * The parser deliberately does not depend on ELM "spaces on/off" formatting.
 * Real adapters and clones may return compact hex, CR/LF-delimited lines,
 * command echo, SEARCHING..., headers or NO DATA.
 */

export const PIDS = {
  ENGINE_RPM:    { service: '01', pid: '0C', name: 'RPM',               unit: 'rpm',  parse: (a, b) => ((a * 256) + b) / 4 },
  COOLANT_TEMP:  { service: '01', pid: '05', name: 'Coolant Temp',      unit: '°C',   parse: (a) => a - 40 },
  MAF_AIR_FLOW:  { service: '01', pid: '10', name: 'MAF Air Flow',      unit: 'g/s',  parse: (a, b) => ((a * 256) + b) / 100 },
  FUEL_PRESSURE: { service: '01', pid: '0A', name: 'Fuel Pressure',     unit: 'kPa',  parse: (a) => a * 3 },
  SPEED:         { service: '01', pid: '0D', name: 'Vehicle Speed',     unit: 'km/h', parse: (a) => a },
  THROTTLE_POS:  { service: '01', pid: '11', name: 'Throttle Position', unit: '%',    parse: (a) => (a / 255) * 100 },
};

const DTC_PREFIX = ['P', 'C', 'B', 'U'];

function compactHex(value = '') {
  return String(value).toUpperCase().replace(/[^0-9A-F]/g, '');
}

function isHexPair(value) {
  return /^[0-9A-F]{2}$/i.test(value || '');
}

export class BaseOBD2Manager {
  constructor() {
    this.isConnected = false;
    this.buffer = '';
    this.messageHandlers = [];
    this.adapterInfo = null;
    this.supportedPidHex = new Set();
  }

  // ─── Abstract – subclasses must implement ────────────────────────────────
  async connect() { throw new Error('connect() not implemented'); }
  async sendCommand(_cmd, _timeout = 1000) { throw new Error('sendCommand() not implemented'); }

  async disconnect() {
    this.isConnected = false;
  }

  // ─── Response normalization ──────────────────────────────────────────────
  normalizeResponse(raw, command = '') {
    const cmd = compactHex(command);
    return String(raw || '')
      .replace(/SEARCHING\.{0,3}/gi, '')
      .replace(/BUS INIT[^\r\n]*/gi, '')
      .replace(/STOPPED/gi, '')
      .replace(/>/g, '')
      .split(/[\r\n]+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => compactHex(line) !== cmd)
      .join('\n')
      .trim();
  }

  responseHasError(raw) {
    const text = String(raw || '').toUpperCase();
    return ['NO DATA', 'UNABLE TO CONNECT', 'BUS ERROR', 'CAN ERROR', '?'].some((token) => text.includes(token));
  }

  extractHexFrames(raw, command = '') {
    const normalized = this.normalizeResponse(raw, command);
    if (!normalized || this.responseHasError(normalized)) return [];

    const frames = [];
    for (const line of normalized.split(/\n+/)) {
      // Drop common CAN header / length prefixes conservatively by looking for
      // a known OBD service response marker later in the line.
      const hex = compactHex(line);
      if (!hex) continue;

      const markers = ['41', '42', '43', '44', '47', '49', '7F'];
      let start = 0;
      for (const marker of markers) {
        const idx = hex.indexOf(marker);
        if (idx >= 0 && (start === 0 || idx < start)) start = idx;
      }
      const payload = hex.slice(start);
      if (payload.length >= 2) frames.push(payload);
    }

    // Some adapters return one long compact frame with no line breaks.
    if (frames.length === 0) {
      const hex = compactHex(normalized);
      if (hex.length >= 2) frames.push(hex);
    }

    return frames;
  }

  bytesFromFrame(frame) {
    const bytes = [];
    for (let i = 0; i + 1 < frame.length; i += 2) {
      const pair = frame.slice(i, i + 2);
      if (isHexPair(pair)) bytes.push(parseInt(pair, 16));
    }
    return bytes;
  }

  // ─── Shared initialization (AT commands) ────────────────────────────────
  async initialize() {
    const commands = [
      { cmd: 'AT Z', desc: 'Reset', timeout: 2500 },
      { cmd: 'AT E0', desc: 'Echo off' },
      { cmd: 'AT S0', desc: 'Space off' },
      { cmd: 'AT L0', desc: 'Linefeeds off' },
      { cmd: 'AT H0', desc: 'Headers off' },
      { cmd: 'AT SP 0', desc: 'Auto protocol', timeout: 1800 },
      { cmd: 'ATI', desc: 'Adapter identity' },
      { cmd: 'ATRV', desc: 'Voltage check' },
    ];

    const results = {};
    for (const { cmd, desc, timeout } of commands) {
      const response = await this.sendCommand(cmd, timeout || 1200);
      results[desc] = response;
      if (this.responseHasError(response) && ['Reset', 'Adapter identity'].includes(desc)) {
        return { success: false, error: desc + ' failed: ' + String(response || 'no response') };
      }
      if (desc === 'Adapter identity') this.adapterInfo = this.normalizeResponse(response, cmd);
      await this.delay(80);
    }

    // Supported PID discovery is useful but not a hard connection gate.
    try {
      await this.discoverSupportedPIDs();
    } catch {}

    return { success: true, results, adapterInfo: this.adapterInfo };
  }

  // ─── Supported PID discovery ─────────────────────────────────────────────
  async discoverSupportedPIDs() {
    const supported = new Set();
    const bases = [0x00, 0x20, 0x40, 0x60];

    for (const base of bases) {
      const pidHex = base.toString(16).padStart(2, '0').toUpperCase();
      const response = await this.sendCommand('01' + pidHex, 1400);
      const frames = this.extractHexFrames(response, '01' + pidHex);
      const marker = '41' + pidHex;
      const frame = frames.find((item) => item.includes(marker));
      if (!frame) continue;

      const idx = frame.indexOf(marker);
      const payload = frame.slice(idx + marker.length, idx + marker.length + 8);
      if (payload.length < 8) continue;

      const bitmap = parseInt(payload, 16) >>> 0;
      for (let bit = 0; bit < 32; bit += 1) {
        if ((bitmap & (1 << (31 - bit))) !== 0) {
          supported.add((base + bit + 1).toString(16).padStart(2, '0').toUpperCase());
        }
      }

      // Bit 32 indicates the next supported-PID range.
      if (!supported.has((base + 0x20).toString(16).padStart(2, '0').toUpperCase())) break;
    }

    this.supportedPidHex = supported;
    return {
      raw: [...supported],
      known: Object.entries(PIDS)
        .filter(([, definition]) => supported.has(definition.pid))
        .map(([key]) => key),
    };
  }

  isPIDSupported(pidKey) {
    const pid = PIDS[pidKey];
    if (!pid) return false;
    if (this.supportedPidHex.size === 0) return true; // unknown, not proven unsupported
    return this.supportedPidHex.has(pid.pid);
  }

  // ─── Shared PID reading ──────────────────────────────────────────────────
  async readPID(pidKey) {
    const pid = PIDS[pidKey];
    if (!pid) throw new Error('Ismeretlen PID: ' + pidKey);
    if (!this.isPIDSupported(pidKey)) throw new Error('PID_NOT_SUPPORTED:' + pidKey);

    const command = pid.service + pid.pid;
    const response = await this.sendCommand(command, 1400);
    if (this.responseHasError(response)) return null;

    const expectedService = (parseInt(pid.service, 16) + 0x40).toString(16).padStart(2, '0').toUpperCase();
    const marker = expectedService + pid.pid;
    const frames = this.extractHexFrames(response, command);
    const frame = frames.find((item) => item.includes(marker));
    if (!frame) return null;

    const index = frame.indexOf(marker);
    const payload = frame.slice(index + marker.length);
    const values = this.bytesFromFrame(payload);
    if (values.length < 1) return null;

    const parsed = pid.parse(...values);
    if (!Number.isFinite(parsed)) return null;

    return { key: pidKey, name: pid.name, value: parsed, unit: pid.unit, raw: response };
  }

  // ─── Shared VIN reading ──────────────────────────────────────────────────
  async readVIN() {
    const response = await this.sendCommand('0902', 2500);
    if (this.responseHasError(response)) return null;

    const frames = this.extractHexFrames(response, '0902');
    const payloadBytes = [];

    for (const frame of frames) {
      const idx = frame.indexOf('4902');
      if (idx < 0) continue;
      let payload = frame.slice(idx + 4);

      // ISO-TP / ELM responses often include a frame sequence byte (01,02,03...).
      if (payload.length >= 2 && /^0[1-9A-F]/.test(payload.slice(0, 2))) {
        payload = payload.slice(2);
      }

      payloadBytes.push(...this.bytesFromFrame(payload));
    }

    const vin = payloadBytes
      .filter((byte) => byte >= 0x20 && byte <= 0x7E)
      .map((byte) => String.fromCharCode(byte))
      .join('')
      .replace(/[^A-HJ-NPR-Z0-9]/gi, '')
      .toUpperCase();

    return vin.length >= 17 ? vin.slice(0, 17) : null;
  }

  // ─── Shared DTC reading ──────────────────────────────────────────────────
  decodeDTC(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || (a === 0 && b === 0)) return null;
    const prefix = DTC_PREFIX[(a & 0xC0) >> 6] || 'P';
    const digit1 = (a & 0x30) >> 4;
    const digit2 = a & 0x0F;
    const digit3 = (b & 0xF0) >> 4;
    const digit4 = b & 0x0F;
    return prefix + digit1.toString(16).toUpperCase() + digit2.toString(16).toUpperCase()
      + digit3.toString(16).toUpperCase() + digit4.toString(16).toUpperCase();
  }

  async readDTCs() {
    const response = await this.sendCommand('03', 1800);
    if (this.responseHasError(response)) return [];

    const frames = this.extractHexFrames(response, '03');
    const codes = new Set();

    for (const frame of frames) {
      const idx = frame.indexOf('43');
      if (idx < 0) continue;
      const bytes = this.bytesFromFrame(frame.slice(idx + 2));
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        const code = this.decodeDTC(bytes[i], bytes[i + 1]);
        if (code) codes.add(code);
      }
    }

    return [...codes];
  }

  async clearDTCs() {
    const response = await this.sendCommand('04', 1800);
    const normalized = compactHex(this.normalizeResponse(response, '04'));
    return normalized.includes('44') || String(response || '').toUpperCase().includes('OK');
  }

  // ─── Utility ─────────────────────────────────────────────────────────────
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  onDataReceived(event) {
    const value = event?.target?.value;
    if (!value) return;
    const data = new TextDecoder().decode(value);
    this.buffer += data;
    this.messageHandlers.forEach((handler) => handler(this.buffer));
  }

  onDisconnect() {
    this.isConnected = false;
  }
}

export default BaseOBD2Manager;
