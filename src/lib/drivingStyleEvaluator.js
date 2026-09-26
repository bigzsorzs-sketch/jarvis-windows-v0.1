function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function evaluateDrivingStyleScore({ rpm = 0, speed = 0, throttlePosition = 0 }) {
  const rpmValue = Number(rpm) || 0;
  const speedValue = Number(speed) || 0;
  const throttleValue = Number(throttlePosition) || 0;

  if (speedValue < 5) return 100;

  const rpmPenalty = rpmValue > 3500 ? 30 : rpmValue > 2800 ? 18 : rpmValue > 2200 ? 8 : 0;
  const throttlePenalty = throttleValue > 70 ? 35 : throttleValue > 50 ? 22 : throttleValue > 35 ? 10 : 0;
  const cityPenalty = speedValue < 30 && throttleValue > 45 ? 12 : 0;

  return Math.round(clamp(100 - rpmPenalty - throttlePenalty - cityPenalty, 0, 100));
}

export function getDrivingStyleLabel(score) {
  if (score >= 80) return 'Gazdaságos';
  if (score >= 55) return 'Kiegyensúlyozott';
  return 'Agresszív';
}