/**
 * Glucose Sensor Registry - Támogatott vércukor szenzortípusok
 */

export const SENSOR_TYPES = {
  LIBRE2: {
    name: 'FreeStyle Libre 2',
    uuid: '6a3e2222-85cb-11ea-abc1-0242ac130003',
    characteristicUUID: '6a3e2223-85cb-11ea-abc1-0242ac130003',
    readInterval: 60000, // 1 perc
    parser: (data) => {
      // Libre2 specifikus parseálás
      const dv = new DataView(data);
      const glucose = dv.getUint16(0, true);
      const trend = dv.getInt8(2);
      return { glucose: glucose / 18, trend, sensor: 'Libre2' };
    }
  },

  DEXCOM_G6: {
    name: 'Dexcom G6',
    uuid: 'f8083532-849e-531c-c594-30b3fb68257f',
    characteristicUUID: 'f8083533-849e-531c-c594-30b3fb68257f',
    readInterval: 300000, // 5 perc (G6 adatfrekvenciája)
    parser: (data) => {
      // Dexcom G6 specifikus parseálás
      const dv = new DataView(data);
      const glucose = dv.getUint16(0, true);
      const trend = dv.getInt8(2);
      return { glucose: glucose / 18, trend, sensor: 'Dexcom G6' };
    }
  },

  DEXCOM_G7: {
    name: 'Dexcom G7',
    uuid: 'd8e90c00-55b6-45bb-987b-21cf96c86e95',
    characteristicUUID: 'd8e90c01-55b6-45bb-987b-21cf96c86e95',
    readInterval: 300000, // 5 perc
    parser: (data) => {
      const dv = new DataView(data);
      const glucose = dv.getUint16(0, true);
      const trend = dv.getInt8(2);
      return { glucose: glucose / 18, trend, sensor: 'Dexcom G7' };
    }
  },

  MEDTRONIC: {
    name: 'Medtronic Guardian',
    uuid: '00001808-0000-1000-8000-00805f9b34fb',
    characteristicUUID: '00002a37-0000-1000-8000-00805f9b34fb',
    readInterval: 300000, // 5 perc
    parser: (data) => {
      const dv = new DataView(data);
      const glucose = dv.getUint16(0, true);
      return { glucose: glucose / 18, trend: 0, sensor: 'Medtronic' };
    }
  },

  ABBOTT_PULSE: {
    name: 'Abbott FreeStyle Pulse',
    uuid: '6a3e2222-85cb-11ea-abc1-0242ac130003',
    characteristicUUID: '6a3e2223-85cb-11ea-abc1-0242ac130003',
    readInterval: 60000, // 1 perc
    parser: (data) => {
      const dv = new DataView(data);
      const glucose = dv.getUint16(0, true);
      const trend = dv.getInt8(2);
      return { glucose: glucose / 18, trend, sensor: 'Abbott Pulse' };
    }
  }
};

export const TREND_NAMES = {
  [-2]: '↓↓ Gyorsan csökken',
  [-1]: '↓ Csökken',
  [0]: '→ Stabil',
  [1]: '↑ Emelkedik',
  [2]: '↑↑ Gyorsan emelkedik'
};