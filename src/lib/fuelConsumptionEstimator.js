const STOICHIOMETRIC_AIR_FUEL_RATIO = 14.7;
const GASOLINE_DENSITY_G_PER_L = 745;
const REFERENCE_FUEL_PRESSURE_KPA = 300;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function estimateFuelConsumption({ maf = 0, speed = 0, fuelPressure = 0 }) {
  const mafValue = Number(maf) || 0;
  const speedValue = Number(speed) || 0;
  const pressureValue = Number(fuelPressure) || REFERENCE_FUEL_PRESSURE_KPA;

  if (mafValue <= 0 || speedValue < 5) return 0;

  const pressureCorrection = clamp(pressureValue / REFERENCE_FUEL_PRESSURE_KPA, 0.85, 1.15);
  const fuelLitersPerHour = ((mafValue * 3600) / STOICHIOMETRIC_AIR_FUEL_RATIO / GASOLINE_DENSITY_G_PER_L) * pressureCorrection;

  return Number(((fuelLitersPerHour / speedValue) * 100).toFixed(1));
}