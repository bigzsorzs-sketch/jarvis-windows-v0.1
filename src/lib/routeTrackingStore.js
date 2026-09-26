import { useSyncExternalStore } from 'react';

let state = {
  activeSession: null,
  syncStatus: 'idle',
  queueStats: { pending: 0, failed: 0 },
  gpsStatus: 'idle',
  trackingMode: 'LOW_POWER',
  autoDriveDetection: {
    avgSpeedKmh: 0,
    avgMotion: 0,
    avgTiltDelta: 0,
    avgGpsAcceleration: 0,
    confidenceScore: 0,
    probableTransportMode: 'unknown',
    drivingDetected: false,
  },
};

const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

export function setRouteTrackingState(patch) {
  state = { ...state, ...patch };
  emit();
}

export function getRouteTrackingState() {
  return state;
}

export function subscribeRouteTracking(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRouteTrackingStore(selector = (current) => current) {
  return useSyncExternalStore(subscribeRouteTracking, () => selector(state), () => selector(state));
}