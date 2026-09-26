/**
 * GlucoSensorManager - Automatikus vércukor szenzor olvasás
 * Libre2, Dexcom, Medtronic, Abbott stb.
 */

import { SENSOR_TYPES, TREND_NAMES } from './SensorRegistry';

export class GlucoSensorManager {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
    this.currentSensor = null;
    this.readingInterval = null;
    this.lastReading = null;
  }

  /**
   * Szenzor felfedezése és csatlakozás
   */
  async detectAndConnect({ allowExperimental = false } = {}) {
    if (!allowExperimental) {
      return {
        success: false,
        experimental: true,
        error: 'A közvetlen CGM Bluetooth kapcsolat nincs éles provider-integrációként hitelesítve. Használd a provider réteget vagy kapcsold be külön a kísérleti módot.',
      };
    }

    try {
      // Bluetooth eszköz keresése - összes sensor típusra
      const filters = Object.values(SENSOR_TYPES).map(sensor => ({
        services: [sensor.uuid]
      }));

      this.device = await navigator.bluetooth.requestDevice({
        filters,
        optionalServices: Object.values(SENSOR_TYPES).map(s => s.uuid)
      });

      this.device.addEventListener('gattserverdisconnected', () => this.onDisconnect());

      // GATT szerver csatlakozás
      this.server = await this.device.gatt.connect();

      // Szenzortípus felismerése
      for (const [type, config] of Object.entries(SENSOR_TYPES)) {
        try {
          const service = await this.server.getPrimaryService(config.uuid);
          this.characteristic = await service.getCharacteristic(config.characteristicUUID);
          this.currentSensor = { type, ...config };
          break;
        } catch {
          // Próbáljuk a következőt
        }
      }

      if (!this.characteristic) {
        throw new Error('Szenzor nem támogatott');
      }

      // Notifikációk engedélyezése
      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', (e) => this.onDataReceived(e));

      this.isConnected = true;
      return {
        success: true,
        device: this.device.name,
        sensor: this.currentSensor.name,
        interval: this.currentSensor.readInterval
      };
    } catch (error) {
      console.error('GlucoSensor connect error:', error);
      return { success: false, error: 'A szenzorhoz most nem tudtunk csatlakozni.' };
    }
  }

  /**
   * Adatok feldolgozása
   */
  onDataReceived(event) {
    const data = event.target.value.buffer;
    
    try {
      const parsed = this.currentSensor.parser(data);
      this.lastReading = {
        ...parsed,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0]
      };

      // Trigger callback ha van
      if (this.onReadingCallback) {
        this.onReadingCallback(this.lastReading);
      }

      console.log(`✅ ${parsed.sensor}: ${parsed.glucose.toFixed(1)} mmol/L ${TREND_NAMES[parsed.trend]}`);
    } catch (error) {
      console.error('GlucoSensor parse error:', error);
    }
  }

  /**
   * Auto-read indítása (polling alapú visszaesés)
   */
  async startAutoRead(callback) {
    this.onReadingCallback = callback;

    if (!this.isConnected) return;

    // Bluetooth notifikáció alapú olvasás (primo)
    // ha az nem működik, polling fallback
    this.readingInterval = setInterval(async () => {
      try {
        const value = await this.characteristic.readValue();
        this.onDataReceived({ target: { value } });
      } catch (error) {
        console.warn('GlucoSensor auto-read error:', error);
      }
    }, this.currentSensor?.readInterval || 60000);
  }

  /**
   * Auto-read leállítása
   */
  stopAutoRead() {
    if (this.readingInterval) {
      clearInterval(this.readingInterval);
      this.readingInterval = null;
    }
  }

  /**
   * Disconnect
   */
  onDisconnect() {
    this.isConnected = false;
    this.stopAutoRead();
    console.log('🔌 Szenzor lecsatlakoztatva');
  }

  /**
   * Csatlakozás lezárása
   */
  async disconnect() {
    this.stopAutoRead();
    if (this.device?.gatt?.connected) {
      await this.device.gatt.disconnect();
    }
    this.isConnected = false;
  }

  /**
   * Utolsó mérés
   */
  getLastReading() {
    return this.lastReading;
  }

  /**
   * Szenzor info
   */
  getSensorInfo() {
    return {
      name: this.currentSensor?.name,
      isConnected: this.isConnected,
      lastReading: this.lastReading
    };
  }
}

export default GlucoSensorManager;