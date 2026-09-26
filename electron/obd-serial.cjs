'use strict';

/**
 * Windows/native serial bridge for USB ELM327/STN adapters.
 *
 * This runs in Electron's main process so the renderer never gets direct Node access.
 * Commands are serialized to prevent interleaved ELM responses.
 */

class OBDSerialBridge {
  constructor({ onEvent } = {}) {
    this.port = null;
    this.path = null;
    this.baudRate = null;
    this.buffer = '';
    this.pending = null;
    this.commandChain = Promise.resolve();
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
  }

  _serialPortClass() {
    try {
      return require('serialport').SerialPort;
    } catch (error) {
      const wrapped = new Error('SERIALPORT_MODULE_UNAVAILABLE');
      wrapped.cause = error;
      throw wrapped;
    }
  }

  async listPorts() {
    const SerialPort = this._serialPortClass();
    const ports = await SerialPort.list();
    return ports.map((item) => ({
      path: item.path,
      manufacturer: item.manufacturer || '',
      serialNumber: item.serialNumber || '',
      pnpId: item.pnpId || '',
      locationId: item.locationId || '',
      vendorId: item.vendorId || '',
      productId: item.productId || '',
    }));
  }

  async connect({ path, baudRate = 38400 } = {}) {
    if (!path || typeof path !== 'string') throw new Error('USB_PORT_REQUIRED');
    const rate = Number(baudRate);
    if (!Number.isFinite(rate) || rate < 1200 || rate > 3000000) throw new Error('INVALID_BAUD_RATE');

    await this.disconnect().catch(() => {});

    const SerialPort = this._serialPortClass();
    const port = new SerialPort({
      path,
      baudRate: rate,
      autoOpen: false,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      rtscts: false,
    });

    await new Promise((resolve, reject) => {
      const onError = (error) => reject(error);
      port.once('error', onError);
      port.open((error) => {
        port.removeListener('error', onError);
        if (error) reject(error);
        else resolve();
      });
    });

    this.port = port;
    this.path = path;
    this.baudRate = rate;
    this.buffer = '';

    port.on('data', (chunk) => this._handleData(chunk));
    port.on('error', (error) => {
      this.onEvent('serial-error', { path: this.path, message: error?.message || String(error) });
      if (this.pending) this._finishPending(error);
    });
    port.on('close', () => {
      this.onEvent('serial-close', { path: this.path });
      if (this.pending) this._finishPending(new Error('SERIAL_PORT_CLOSED'));
      this.port = null;
    });

    this.onEvent('serial-connect', { path, baudRate: rate });
    return this.status();
  }

  _handleData(chunk) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
    this.buffer += text;
    if (this.buffer.length > 65536) this.buffer = this.buffer.slice(-65536);

    if (this.pending && this.buffer.includes('>')) {
      this._finishPending(null, this.buffer);
    }
  }

  _finishPending(error, response = '') {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timer);

    const output = response || this.buffer;
    this.buffer = '';

    if (error) pending.reject(error);
    else pending.resolve(output);
  }

  async _sendNow(command, timeout = 1500) {
    if (!this.port?.isOpen) throw new Error('USB_OBD_NOT_CONNECTED');
    if (!command || typeof command !== 'string') throw new Error('OBD_COMMAND_REQUIRED');

    const clean = command.replace(/[\r\n]/g, '').trim();
    if (!clean || clean.length > 64) throw new Error('INVALID_OBD_COMMAND');

    this.buffer = '';

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const partial = this.buffer;
        this.pending = null;
        this.buffer = '';
        if (partial.trim()) resolve(partial);
        else reject(new Error('OBD_COMMAND_TIMEOUT:' + clean));
      }, Math.max(250, Math.min(Number(timeout) || 1500, 10000)));

      this.pending = { resolve, reject, timer, command: clean };

      this.port.write(clean + '\r', 'ascii', (writeError) => {
        if (writeError) {
          this._finishPending(writeError);
          return;
        }
        this.port.drain((drainError) => {
          if (drainError) this._finishPending(drainError);
        });
      });
    });
  }

  send({ command, timeout = 1500 } = {}) {
    const run = () => this._sendNow(command, timeout);
    const result = this.commandChain.then(run, run);
    this.commandChain = result.catch(() => {});
    return result;
  }

  async disconnect() {
    if (this.pending) this._finishPending(new Error('SERIAL_DISCONNECT'));
    const port = this.port;
    this.port = null;
    this.buffer = '';

    if (port?.isOpen) {
      await new Promise((resolve) => {
        port.close(() => resolve());
      });
    }

    const oldPath = this.path;
    this.path = null;
    this.baudRate = null;
    if (oldPath) this.onEvent('serial-disconnect', { path: oldPath });
    return { connected: false };
  }

  status() {
    return {
      connected: Boolean(this.port?.isOpen),
      path: this.path,
      baudRate: this.baudRate,
    };
  }
}

module.exports = { OBDSerialBridge };
