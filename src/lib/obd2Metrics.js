import { estimateFuelConsumption } from '@/lib/fuelConsumptionEstimator';
import { evaluateDrivingStyleScore, getDrivingStyleLabel } from '@/lib/drivingStyleEvaluator';

// OBD2 Metrics configuration
export const OBD2_METRICS = [
  {
    id: 'rpm',
    name: 'RPM',
    pidHex: '010C',
    unit: 'ford./perc',
    min: 0,
    max: 8000,
    color: '#ffc107',
    parse: (data) => {
      const a = parseInt(data.substring(0, 2), 16);
      const b = parseInt(data.substring(2, 4), 16);
      return ((a * 256 + b) / 4).toFixed(0);
    },
  },
  {
    id: 'coolant_temp',
    name: 'Motorolaj hőm.',
    pidHex: '0105',
    unit: '°C',
    min: -40,
    max: 120,
    color: '#dc3545',
    parse: (data) => {
      const a = parseInt(data.substring(0, 2), 16);
      return (a - 40).toFixed(1);
    },
  },
  {
    id: 'intake_air_temp',
    name: 'Szívólevegő hőm.',
    pidHex: '010F',
    unit: '°C',
    min: -40,
    max: 100,
    color: '#17a2b8',
    parse: (data) => {
      const a = parseInt(data.substring(0, 2), 16);
      return (a - 40).toFixed(1);
    },
  },
  {
    id: 'maf',
    name: 'Légtömeg (MAF)',
    pidHex: '0110',
    unit: 'g/s',
    min: 0,
    max: 100,
    color: '#28a745',
    parse: (data) => {
      const a = parseInt(data.substring(0, 2), 16);
      const b = parseInt(data.substring(2, 4), 16);
      return ((a * 256 + b) / 100).toFixed(2);
    },
  },
  {
    id: 'engine_load',
    name: 'Motorterhelés',
    pidHex: '0104',
    unit: '%',
    min: 0,
    max: 100,
    color: '#22c55e',
    parse: (data) => {
      const a = parseInt(data.substring(0, 2), 16);
      return ((a / 255) * 100).toFixed(1);
    },
  },
  {
    id: 'speed',
    name: 'Sebesség',
    pidHex: '010D',
    unit: 'km/h',
    min: 0,
    max: 220,
    color: '#007bff',
    parse: (data) => {
      const a = parseInt(data.substring(0, 2), 16);
      return a.toString();
    },
  },
  {
    id: 'fuel_pressure',
    name: 'Üzemanyag nyomás',
    pidHex: '010A',
    unit: 'kPa',
    min: 0,
    max: 680,
    color: '#6f42c1',
    parse: (data) => {
      const a = parseInt(data.substring(0, 2), 16);
      return (a * 3).toFixed(0);
    },
  },
  {
    id: 'fuel_consumption',
    name: 'Aktuális fogyasztás',
    unit: 'L/100km',
    min: 0,
    max: 25,
    color: '#10b981',
    dependencies: ['fuel_pressure', 'maf', 'speed'],
    parseDerived: ({ fuel_pressure, maf, speed }) => estimateFuelConsumption({
      fuelPressure: fuel_pressure,
      maf,
      speed,
    }),
  },
  {
    id: 'intake_pressure',
    name: 'Szívónyomás',
    pidHex: '010B',
    unit: 'kPa',
    min: 0,
    max: 255,
    color: '#fd7e14',
    parse: (data) => {
      const a = parseInt(data.substring(0, 2), 16);
      return a.toString();
    },
  },
  {
    id: 'turbo_pressure',
    name: 'Turbónyomás',
    pidHex: '0163',
    unit: 'kPa',
    min: 0,
    max: 400,
    color: '#e83e8c',
    parse: (data) => {
      const a = parseInt(data.substring(0, 2), 16);
      const b = parseInt(data.substring(2, 4), 16);
      return ((a * 256 + b) / 100 - 100).toFixed(1);
    },
  },
  {
    id: 'throttle_position',
    name: 'Gázpedál pozíció',
    pidHex: '0111',
    unit: '%',
    min: 0,
    max: 100,
    color: '#20c997',
    parse: (data) => {
      const a = parseInt(data.substring(0, 2), 16);
      return ((a / 255) * 100).toFixed(1);
    },
  },
  {
    id: 'driving_score',
    name: 'Vezetési pontszám',
    unit: '/100',
    min: 0,
    max: 100,
    color: '#22c55e',
    dependencies: ['rpm', 'speed', 'throttle_position'],
    parseDerived: ({ rpm, speed, throttle_position }) => evaluateDrivingStyleScore({
      rpm,
      speed,
      throttlePosition: throttle_position,
    }),
    getStatus: getDrivingStyleLabel,
  },
  {
    id: 'oxygen_sensor',
    name: 'Oxigén szenzor',
    pidHex: '0114',
    unit: 'V',
    min: 0,
    max: 1,
    color: '#a8dadc',
    parse: (data) => {
      const a = parseInt(data.substring(0, 2), 16);
      return (a / 200).toFixed(3);
    },
  },
];

export function getMetricById(id) {
  return OBD2_METRICS.find((m) => m.id === id);
}

export function getMetricsByIds(ids) {
  return ids.map((id) => getMetricById(id)).filter(Boolean);
}

// LocalStorage management
const STORAGE_KEY = 'obd2_dashboard_config';

export function saveDashboardConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function loadDashboardConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : ['rpm', 'coolant_temp', 'speed'];
  } catch {
    return ['rpm', 'coolant_temp', 'speed'];
  }
}