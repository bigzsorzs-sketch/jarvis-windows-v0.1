'use strict';

const net = require('node:net');
const { SerialPort } = require('serialport');

const OBD_HINTS = [
  'OBD', 'ELM', 'OBDLINK', 'VGATE', 'V-LINK', 'VLINK', 'ICAR',
  'VEEPEAK', 'KONNWEI', 'FTDI', 'USB SERIAL', 'CH340', 'CP210',
  'BTHENUM', 'BLUETOOTH', 'STANDARD SERIAL'
];

function scorePort(port) {
  const haystack = [
    port.path, port.manufacturer, port.pnpId, port.serialNumber,
    port.vendorId, port.productId
  ].filter(Boolean).join(' ').toUpperCase();

  let score = 0;
  for (const hint of OBD_HINTS) {
    if (haystack.includes(hint)) score += hint === 'OBD' || hint === 'ELM' || hint === 'OBDLINK' ? 10 : 2;
  }
  if (/BTHENUM|BLUETOOTH/.test(haystack)) score += 4;
  if (/FTDI|CH340|CP210|USB SERIAL/.test(haystack)) score += 3;
  return score;
}

function parseHostPort(value) {
  const raw = String(value || '').trim().replace(/^(tcp|http|https|ws):\/\//i, '').replace(/\/.*$/, '');
  const [host, portText] = raw.split(':');
  const port = Number(portText || 35000);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('INVALID_WIFI_ADDRESS');
  }
  return { host, port };
}

class NativeObdBridge {
  constructor() {
    this.active = null;
    this.pending = null;
    this.responseBuffer = '';
    this.queue = Promise.resolve();
  }

  async listSerialPorts() {
    const ports = await SerialPort.list();
    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer || '',
      serialNumber: port.serialNumber || '',
      pnpId: port.pnpId || '',
      vendorId: port.vendorId || '',
      productId: port.productId || '',
      score: scorePort(port),
    })).sort((a, b) => (b.score - a.score) || a.path.localeCompare(b.path));
  }

  async connect(options = {}) {
    await this.disconnect();
    const type = String(options.type || 'serial');
    if (type === 'wifi') return this.connectWifi(options.address || options.host);
    if (type === 'serial') return this.connectSerial(options.path, options.baudRate);
    throw new Error('UNSUPPORTED_OBD_TRANSPORT');
  }

  async connectSerial(portPath, baudRate = 38400) {
    if (!portPath) throw new Error('OBD_SERIAL_PORT_REQUIRED');

    const port = new SerialPort({
      path: String(portPath),
      baudRate: Number(baudRate) || 38400,
      autoOpen: false,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      rtscts: false,
    });

    await new Promise((resolve, reject) => {
      port.open((error) => error ? reject(error) : resolve());
    });

    port.on('data', (chunk) => this.handleData(chunk));
    port.on('error', (error) => this.handleTransportError(error));
    port.on('close', () => {
      if (this.active?.resource === port) this.active = null;
    });

    this.active = {
      type: 'serial',
      resource: port,
      label: String(portPath),
      baudRate: Number(baudRate) || 38400,
    };

    return { success: true, type: 'serial', device: String(portPath), baudRate: this.active.baudRate };
  }

  async connectWifi(address) {
    const { host, port } = parseHostPort(address);
    const socket = new net.Socket();
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 5000);

    await new Promise((resolve, reject) => {
      const onError = (error) => {
        socket.off('connect', onConnect);
        reject(error);
      };
      const onConnect = () => {
        socket.off('error', onError);
        resolve();
      };
      socket.once('error', onError);
      socket.once('connect', onConnect);
      socket.connect(port, host);
    });

    socket.on('data', (chunk) => this.handleData(chunk));
    socket.on('error', (error) => this.handleTransportError(error));
    socket.on('close', () => {
      if (this.active?.resource === socket) this.active = null;
    });

    this.active = { type: 'wifi', resource: socket, label: host + ':' + port, host, port };
    return { success: true, type: 'wifi', device: host + ':' + port };
  }

  handleData(chunk) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
    this.responseBuffer += text;
    if (this.pending && this.responseBuffer.includes('>')) {
      const pending = this.pending;
      this.pending = null;
      clearTimeout(pending.timer);
      pending.resolve(this.responseBuffer);
    }
  }

  handleTransportError(error) {
    if (this.pending) {
      const pending = this.pending;
      this.pending = null;
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  async write(text) {
    if (!this.active) throw new Error('OBD_NOT_CONNECTED');
    const { type, resource } = this.active;

    if (type === 'serial') {
      await new Promise((resolve, reject) => {
        resource.write(text, (error) => {
          if (error) return reject(error);
          resource.drain((drainError) => drainError ? reject(drainError) : resolve());
        });
      });
      return;
    }

    if (type === 'wifi') {
      await new Promise((resolve, reject) => {
        resource.write(text, (error) => error ? reject(error) : resolve());
      });
      return;
    }

    throw new Error('OBD_NOT_CONNECTED');
  }

  async sendCommand(command, timeout = 1800) {
    const task = this.queue.then(
      () => this.sendCommandNow(command, timeout),
      () => this.sendCommandNow(command, timeout),
    );
    this.queue = task.catch(() => {});
    return task;
  }

  async sendCommandNow(command, timeout = 1800) {
    if (!this.active) throw new Error('OBD_NOT_CONNECTED');
    const clean = String(command || '').trim().replace(/[\r\n]+/g, '');
    if (!clean) throw new Error('OBD_EMPTY_COMMAND');

    this.responseBuffer = '';

    return new Promise(async (resolve, reject) => {
      const pending = {
        resolve,
        reject,
        timer: setTimeout(() => {
          if (this.pending === pending) this.pending = null;
          resolve(this.responseBuffer);
        }, Math.max(250, Number(timeout) || 1800)),
      };
      this.pending = pending;

      try {
        await this.write(clean + '\r');
      } catch (error) {
        if (this.pending === pending) this.pending = null;
        clearTimeout(pending.timer);
        reject(error);
      }
    });
  }

  async status() {
    return this.active ? {
      connected: true,
      type: this.active.type,
      device: this.active.label,
      baudRate: this.active.baudRate || null,
    } : { connected: false };
  }

  async disconnect() {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.resolve(this.responseBuffer);
      this.pending = null;
    }

    const active = this.active;
    this.active = null;
    this.responseBuffer = '';

    if (!active) return { success: true };

    if (active.type === 'serial' && active.resource?.isOpen) {
      await new Promise((resolve) => active.resource.close(() => resolve()));
    } else if (active.type === 'wifi' && active.resource) {
      active.resource.destroy();
    }

    return { success: true };
  }
}

module.exports = { NativeObdBridge };
