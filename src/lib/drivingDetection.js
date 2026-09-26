import { setRouteTrackingState } from '@/lib/routeTrackingStore';

const STATE = {
  speedSamples: [],
  motionSamples: [],
  tiltSamples: [],
  gpsAccelerationSamples: [],
  headingChangeSamples: [],
  lastPosition: null,
  lastTilt: null,
  lastSpeedKmh: 0,
  lastDetectionAt: 0,
  consecutiveDrivingSignals: 0,
  consecutiveIdleSignals: 0,
  motionPermissionAsked: false,
};

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function magnitude(acceleration = {}) {
  const x = acceleration.x || 0;
  const y = acceleration.y || 0;
  const z = acceleration.z || 0;
  return Math.sqrt(x * x + y * y + z * z);
}

function pushSample(list, value, max = 8) {
  list.push(value);
  if (list.length > max) list.shift();
}

function toKmhFromPositions(previousPosition, nextPosition) {
  if (!previousPosition || !nextPosition) return 0;
  const prevTime = previousPosition.timestamp || 0;
  const nextTime = nextPosition.timestamp || 0;
  const deltaHours = (nextTime - prevTime) / 3600000;
  if (deltaHours <= 0) return 0;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const lat1 = previousPosition.coords.latitude;
  const lng1 = previousPosition.coords.longitude;
  const lat2 = nextPosition.coords.latitude;
  const lng2 = nextPosition.coords.longitude;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = 6371 * c;
  return distanceKm / deltaHours;
}

function normalizeAngleDelta(next, previous) {
  if (typeof next !== 'number' || typeof previous !== 'number') return 0;
  const raw = Math.abs(next - previous) % 360;
  return raw > 180 ? 360 - raw : raw;
}

function computeTilt(acceleration = {}) {
  const x = acceleration.x || 0;
  const y = acceleration.y || 0;
  const z = acceleration.z || 0;
  const horizontal = Math.sqrt(x * x + y * y);
  return Math.atan2(horizontal, Math.abs(z || 0.0001)) * (180 / Math.PI);
}

function classifyTransport({ avgSpeed, avgMotion, avgTiltDelta, avgGpsAcceleration, avgHeadingChange }) {
  let score = 0;

  if (avgSpeed >= 28) score += 3;
  else if (avgSpeed >= 20) score += 2;
  else if (avgSpeed >= 14) score += 1;

  if (avgGpsAcceleration >= 1.2 && avgGpsAcceleration <= 8) score += 2;
  else if (avgGpsAcceleration >= 0.6) score += 1;

  if (avgTiltDelta <= 9) score += 2;
  else if (avgTiltDelta <= 15) score += 1;

  if (avgMotion >= 0.08 && avgMotion <= 0.45) score += 2;
  else if (avgMotion < 0.7) score += 1;

  if (avgHeadingChange <= 18) score += 1;

  let probableTransportMode = 'unknown';
  if (avgSpeed < 18 && avgMotion > 0.35) probableTransportMode = 'cycling';
  else if (avgTiltDelta > 14 && avgHeadingChange > 22) probableTransportMode = 'bus';
  else if (score >= 6) probableTransportMode = 'car';

  return { score, probableTransportMode };
}

export async function requestMotionAccessIfNeeded() {
  if (STATE.motionPermissionAsked) return;
  STATE.motionPermissionAsked = true;
  if (typeof DeviceMotionEvent === 'undefined' || typeof DeviceMotionEvent.requestPermission !== 'function') return;
  try {
    await DeviceMotionEvent.requestPermission();
  } catch {
    // ignore
  }
}

export function startDrivingDetection({ onDrivingDetected, minSpeedKmh = 20, minMotion = 0.08, minDetectionCount = 3, cooldownMs = 120000 }) {
  let geoWatchId = null;
  let stopped = false;
  let drivingDetected = false;

  const evaluate = () => {
    const avgSpeed = average(STATE.speedSamples);
    const avgMotion = average(STATE.motionSamples);
    const avgTiltDelta = average(STATE.tiltSamples);
    const avgGpsAcceleration = average(STATE.gpsAccelerationSamples);
    const avgHeadingChange = average(STATE.headingChangeSamples);
    const { score, probableTransportMode } = classifyTransport({
      avgSpeed,
      avgMotion,
      avgTiltDelta,
      avgGpsAcceleration,
      avgHeadingChange,
    });

    const drivingSignal = avgSpeed >= minSpeedKmh && avgMotion >= minMotion && score >= 6 && probableTransportMode === 'car';
    const idleSignal = avgSpeed < 8 && avgMotion < 0.08;

    STATE.consecutiveDrivingSignals = drivingSignal ? STATE.consecutiveDrivingSignals + 1 : 0;
    STATE.consecutiveIdleSignals = idleSignal ? STATE.consecutiveIdleSignals + 1 : 0;

    if (!drivingDetected && STATE.consecutiveDrivingSignals >= minDetectionCount) {
      drivingDetected = true;
    }
    if (drivingDetected && (STATE.consecutiveIdleSignals >= minDetectionCount || probableTransportMode === 'cycling')) {
      drivingDetected = false;
    }

    setRouteTrackingState({
      autoDriveDetection: {
        avgSpeedKmh: Math.round(avgSpeed),
        avgMotion: Number(avgMotion.toFixed(2)),
        avgTiltDelta: Number(avgTiltDelta.toFixed(2)),
        avgGpsAcceleration: Number(avgGpsAcceleration.toFixed(2)),
        confidenceScore: score,
        probableTransportMode,
        drivingDetected,
      }
    });

    if (drivingDetected && Date.now() - STATE.lastDetectionAt > cooldownMs) {
      STATE.lastDetectionAt = Date.now();
      onDrivingDetected?.({ avgSpeedKmh: avgSpeed, avgMotion, avgTiltDelta, avgGpsAcceleration, confidenceScore: score });
    }
  };

  const onMotion = (event) => {
    if (stopped) return;
    const acceleration = event.accelerationIncludingGravity || event.acceleration;
    const currentTilt = computeTilt(acceleration);
    const tiltDelta = STATE.lastTilt === null ? 0 : Math.abs(currentTilt - STATE.lastTilt);
    STATE.lastTilt = currentTilt;
    pushSample(STATE.motionSamples, magnitude(event.acceleration || {}));
    pushSample(STATE.tiltSamples, tiltDelta);
    evaluate();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('devicemotion', onMotion);
  }

  if (navigator.geolocation) {
    geoWatchId = navigator.geolocation.watchPosition((position) => {
      if (stopped) return;
      const rawSpeed = position.coords.speed;
      const gpsSpeedKmh = typeof rawSpeed === 'number' && rawSpeed >= 0 ? rawSpeed * 3.6 : 0;
      const derivedSpeedKmh = toKmhFromPositions(STATE.lastPosition, position);
      const speedKmh = Math.max(gpsSpeedKmh, derivedSpeedKmh);
      const timeDeltaSec = STATE.lastPosition ? Math.max(1, (position.timestamp - STATE.lastPosition.timestamp) / 1000) : 1;
      const gpsAcceleration = Math.abs(speedKmh - STATE.lastSpeedKmh) / timeDeltaSec;
      const headingChange = normalizeAngleDelta(position.coords.heading, STATE.lastPosition?.coords?.heading);

      STATE.lastPosition = position;
      STATE.lastSpeedKmh = speedKmh;
      pushSample(STATE.speedSamples, speedKmh);
      pushSample(STATE.gpsAccelerationSamples, gpsAcceleration);
      pushSample(STATE.headingChangeSamples, headingChange);
      evaluate();
    }, () => {}, {
      enableHighAccuracy: false,
      maximumAge: 10000,
      timeout: 12000,
    });
  }

  return () => {
    stopped = true;
    if (geoWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(geoWatchId);
    if (typeof window !== 'undefined') window.removeEventListener('devicemotion', onMotion);
  };
}