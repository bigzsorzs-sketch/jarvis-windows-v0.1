import { jarvis } from '@/api/jarvisClient';
import { CONFIG } from '@/lib/appConfig';
import { networkMonitor } from '@/lib/networkMonitor';
import { enqueueRouteAction, retryFailedRouteSync, syncRouteQueue } from '@/lib/routeOfflineQueue';
import { getRouteTrackingState, setRouteTrackingState } from '@/lib/routeTrackingStore';

const ACTIVE_ROUTE_KEY = 'jarvis_active_route';
const DEST_CACHE_KEY = 'jarvis_destination_cache';
const ROUTE_POINTS_KEY = 'jarvis_route_points';

let watchId = null;
let highAccuracyUntil = 0;
let lastUiSyncAt = 0;
let lastTrackedPoint = null;

async function getCurrentUserOrThrow() {
  const currentUser = await jarvis.auth.me().catch(() => null);
  if (!currentUser?.email) throw new Error('AUTH_REQUIRED');
  return currentUser;
}

function nowIso() {
  return new Date().toISOString();
}

function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GEO_NOT_SUPPORTED'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: options.enableHighAccuracy || false,
      timeout: 10000,
      maximumAge: options.maximumAge ?? 30000,
    });
  });
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toMeters(km) {
  return km * 1000;
}

function durationMinutes(startTime, endTime = Date.now()) {
  return Math.max(1, Math.round((endTime - new Date(startTime).getTime()) / 60000));
}

function estimateDurationMinutes(distanceKm) {
  return Math.max(1, Math.round((distanceKm / 40) * 60));
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadDestinationCache() {
  return loadJson(DEST_CACHE_KEY, []);
}

function saveDestinationCache(entry) {
  const current = loadDestinationCache();
  const normalized = entry.contact_name?.toLowerCase();
  const existing = current.filter((item) => item.contact_name?.toLowerCase() !== normalized);
  saveJson(DEST_CACHE_KEY, [{ ...entry, last_used_at: nowIso() }, ...existing].slice(0, 10));
}

export function getLastDestinations() {
  return loadDestinationCache();
}

export function getActiveRoute() {
  const parsed = loadJson(ACTIVE_ROUTE_KEY, null);
  if (!parsed) return null;
  const timeoutMs = parsed.tracking_mode === 'LOW_POWER'
    ? CONFIG.ROUTE_LOW_POWER_SESSION_TIMEOUT_MS
    : CONFIG.ROUTE_SESSION_TIMEOUT_MS;
  const anchor = new Date(parsed.last_update_at || parsed.start_time).getTime();
  if (!Number.isFinite(anchor) || Date.now() - anchor > timeoutMs) {
    clearActiveRoute();
    return null;
  }
  return parsed;
}

function setActiveRoute(route) {
  saveJson(ACTIVE_ROUTE_KEY, route);
  setRouteTrackingState({ activeSession: route, trackingMode: route.tracking_mode || CONFIG.ROUTE_TRACKING_MODE });
}

export function clearActiveRoute() {
  localStorage.removeItem(ACTIVE_ROUTE_KEY);
  localStorage.removeItem(ROUTE_POINTS_KEY);
  stopRouteTracking();
  setRouteTrackingState({ activeSession: null, gpsStatus: 'idle' });
}

function loadRoutePoints() {
  return loadJson(ROUTE_POINTS_KEY, []);
}

function saveRoutePoints(points) {
  saveJson(ROUTE_POINTS_KEY, points.slice(-200));
}

function getTrackingConfig(mode) {
  const normalized = mode || CONFIG.ROUTE_TRACKING_MODE;
  if (normalized === 'HIGH_ACCURACY') {
    return { enableHighAccuracy: true, intervalMs: 60000, minDistanceM: 150 };
  }
  if (normalized === 'BALANCED') {
    return { enableHighAccuracy: false, intervalMs: Math.max(CONFIG.GPS_MIN_INTERVAL_MS, 90000), minDistanceM: Math.max(CONFIG.GPS_MIN_DISTANCE_M, 250) };
  }
  return { enableHighAccuracy: false, intervalMs: 0, minDistanceM: Infinity };
}

function shouldAcceptPoint(previousPoint, nextPoint) {
  if (!nextPoint) return false;
  if (typeof nextPoint.accuracy === 'number' && nextPoint.accuracy > 120) return false;
  if (!previousPoint) return true;

  const distanceKm = haversineKm(previousPoint.lat, previousPoint.lng, nextPoint.lat, nextPoint.lng);
  const minutes = Math.max(1 / 60, (new Date(nextPoint.timestamp).getTime() - new Date(previousPoint.timestamp).getTime()) / 3600000);
  const speedKmh = distanceKm / minutes;
  if (speedKmh > 180) return false;
  return true;
}

function calculateDistanceKm(points, startPoint, endPoint) {
  const validPoints = points.filter(Boolean);
  if (validPoints.length < 2) {
    return Number(haversineKm(startPoint.lat, startPoint.lng, endPoint.lat, endPoint.lng).toFixed(1));
  }
  let total = 0;
  for (let index = 1; index < validPoints.length; index += 1) {
    total += haversineKm(validPoints[index - 1].lat, validPoints[index - 1].lng, validPoints[index].lat, validPoints[index].lng);
  }
  return Number(total.toFixed(1));
}

function queueRouteAction(type, payload) {
  enqueueRouteAction(type, payload);
}

function buildSession(contactName, destinationAddress, startPoint, trackingMode, destinationCoords) {
  return {
    local_id: crypto.randomUUID(),
    contact_name: contactName,
    destination_address: destinationAddress,
    start_lat: startPoint.lat,
    start_lng: startPoint.lng,
    start_time: startPoint.timestamp,
    last_known_lat: startPoint.lat,
    last_known_lng: startPoint.lng,
    last_update_at: startPoint.timestamp,
    tracking_mode: trackingMode,
    sync_status: networkMonitor.isOnline() ? 'pending' : 'offline',
    destination_lat: destinationCoords?.lat,
    destination_lng: destinationCoords?.lng,
  };
}

function maybeEmitUiUpdate(session, extra = {}) {
  if (Date.now() - lastUiSyncAt < CONFIG.ROUTE_UI_REFRESH_MS) return;
  lastUiSyncAt = Date.now();
  setRouteTrackingState({ activeSession: session, ...extra });
}

function stopRouteTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

function startWatchIfNeeded(session) {
  stopRouteTracking();
  if (document.hidden) {
    setRouteTrackingState({ gpsStatus: 'battery_safe' });
    return;
  }
  const config = getTrackingConfig(session.tracking_mode);
  if (!navigator.geolocation || !Number.isFinite(config.minDistanceM) || config.intervalMs <= 0) {
    setRouteTrackingState({ gpsStatus: 'battery_safe' });
    return;
  }

  watchId = navigator.geolocation.watchPosition((position) => {
    const activeAtTick = getActiveRoute();
    const activeMode = activeAtTick?.tracking_mode || 'LOW_POWER';
    if (activeMode === 'LOW_POWER') return;
    const lastTime = lastTrackedPoint ? new Date(lastTrackedPoint.timestamp).getTime() : 0;
    if (Date.now() - lastTime < config.intervalMs) return;

    const point = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: nowIso(),
    };

    if (!shouldAcceptPoint(lastTrackedPoint, point)) {
      maybeEmitUiUpdate(getActiveRoute(), { gpsStatus: 'weak_accuracy' });
      return;
    }

    if (lastTrackedPoint) {
      const movedM = toMeters(haversineKm(lastTrackedPoint.lat, lastTrackedPoint.lng, point.lat, point.lng));
      if (movedM < config.minDistanceM) return;
    }

    const active = getActiveRoute();
    if (!active) return;

    lastTrackedPoint = point;
    const nextSession = {
      ...active,
      last_known_lat: point.lat,
      last_known_lng: point.lng,
      last_update_at: point.timestamp,
      sync_status: networkMonitor.isOnline() ? 'pending' : 'offline',
    };
    setActiveRoute(nextSession);

    const points = [...loadRoutePoints(), point];
    saveRoutePoints(points);
    queueRouteAction('route_update', { ...nextSession, local_id: nextSession.local_id, notes: `point_count:${points.length}` });
    maybeEmitUiUpdate(nextSession, { gpsStatus: 'tracking' });

    if (active.destination_lat && active.destination_lng) {
      const proximityM = toMeters(haversineKm(point.lat, point.lng, active.destination_lat, active.destination_lng));
      if (proximityM <= CONFIG.ROUTE_PROXIMITY_M) {
        finishNavigationSession('destination_reached').catch(() => null);
      }
    }
  }, () => {
    setRouteTrackingState({ gpsStatus: 'weak_accuracy' });
  }, {
    enableHighAccuracy: config.enableHighAccuracy && Date.now() < highAccuracyUntil,
    maximumAge: config.intervalMs,
    timeout: 15000,
  });
}

export async function startNavigationSession(contact, destinationAddress, options = {}) {
  const currentUser = await getCurrentUserOrThrow();
  if (getActiveRoute()) return { local_id: getActiveRoute().local_id, eta_min: 0, offline: !networkMonitor.isOnline() };
  const trackingMode = options.trackingMode || 'LOW_POWER';
  const position = await getCurrentPosition({ enableHighAccuracy: trackingMode === 'HIGH_ACCURACY' });
  const startPoint = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: nowIso(),
  };

  const session = buildSession(contact.name, destinationAddress, startPoint, trackingMode, options.destinationCoords);
  lastTrackedPoint = startPoint;
  saveRoutePoints([startPoint]);
  setActiveRoute(session);
  saveDestinationCache({ contact_name: contact.name, destination_address: destinationAddress });
  queueRouteAction('route_start', { ...session, local_id: session.local_id, created_by: currentUser.email });
  if (networkMonitor.isOnline()) syncRouteQueue();

  if (trackingMode === 'HIGH_ACCURACY') {
    highAccuracyUntil = Date.now() + CONFIG.GPS_HIGH_ACCURACY_MAX_MS;
  }
  startWatchIfNeeded(session);

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationAddress)}&travelmode=driving`;
  window.open(mapsUrl, '_blank');

  const destinationDistanceKm = options.destinationCoords
    ? haversineKm(startPoint.lat, startPoint.lng, options.destinationCoords.lat, options.destinationCoords.lng)
    : 10;

  return {
    local_id: session.local_id,
    eta_min: estimateDurationMinutes(destinationDistanceKm),
    offline: !networkMonitor.isOnline(),
  };
}

export async function finishNavigationSession(reason = 'manual') {
  const active = getActiveRoute();
  if (!active?.local_id) throw new Error('NO_ACTIVE_ROUTE');

  const position = await getCurrentPosition({ enableHighAccuracy: false }).catch(() => null);
  const endPoint = position ? {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: nowIso(),
  } : {
    lat: active.last_known_lat || active.start_lat,
    lng: active.last_known_lng || active.start_lng,
    timestamp: nowIso(),
  };

  const points = loadRoutePoints();
  const distanceKm = calculateDistanceKm(points, { lat: active.start_lat, lng: active.start_lng }, endPoint);
  const durationMin = durationMinutes(active.start_time, new Date(endPoint.timestamp).getTime());

  queueRouteAction('route_end', {
    local_id: active.local_id,
    end_lat: endPoint.lat,
    end_lng: endPoint.lng,
    end_time: endPoint.timestamp,
    distance_km: distanceKm,
    duration_min: durationMin,
    notes: `end_reason:${reason}`,
  });

  if (networkMonitor.isOnline()) syncRouteQueue();
  clearActiveRoute();

  return {
    summary: `Trip completed: ${distanceKm} km, ${durationMin} min`,
    distance_km: distanceKm,
    duration_min: durationMin,
  };
}

export async function findContactForNavigation(query) {
  const currentUser = await getCurrentUserOrThrow();
  const contacts = await jarvis.entities.Contact.filter({ created_by: currentUser.email }, '-created_date', 50);
  const normalized = query.toLowerCase();
  return contacts.find((contact) => contact.name?.toLowerCase().includes(normalized)) || null;
}

export async function getLastTripSummary() {
  const currentUser = await getCurrentUserOrThrow();
  const routes = await jarvis.entities.RouteHistory.filter({ created_by: currentUser.email }, '-created_date', 20);
  const lastRoute = routes.find((route) => route.end_time) || routes[0];
  if (!lastRoute) return { success: false, message: 'Még nincs elmentett út, amit összefoglalhatnék.' };

  const destination = lastRoute.contact_name || lastRoute.destination_address || 'ismeretlen célpont';
  const distance = typeof lastRoute.distance_km === 'number' ? `${lastRoute.distance_km} km` : 'nincs távolság adat';
  const duration = typeof lastRoute.duration_min === 'number' ? `${lastRoute.duration_min} perc` : 'nincs időtartam adat';
  const ended = lastRoute.end_time ? new Date(lastRoute.end_time).toLocaleString('hu-HU') : 'még nincs lezárva';

  return {
    success: true,
    message: `🧭 Utolsó út: ${destination}. Táv: ${distance}, idő: ${duration}. Lezárva: ${ended}.`,
    data: lastRoute,
  };
}

export async function shareActiveNavigationDestination(contactQuery) {
  const active = getActiveRoute();
  if (!active?.destination_address) return { success: false, message: 'Nincs aktív navigációs célpont, amit megoszthatnék.' };

  const contact = await findContactForNavigation(contactQuery);
  if (!contact) return { success: false, message: `Nem találtam ilyen kontaktot: ${contactQuery}.` };

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(active.destination_address)}`;
  const text = `Navigációs célpontom: ${active.destination_address} ${mapsUrl}`;

  if (contact.phone) {
    window.location.href = `sms:${contact.phone.replace(/\s/g, '')}?body=${encodeURIComponent(text)}`;
    return { success: true, message: `📍 Megnyitottam az SMS-t ${contact.name} részére a navigációs célponttal.`, data: { contact, destination: active.destination_address } };
  }

  if (contact.email) {
    window.open(`mailto:${contact.email}?subject=${encodeURIComponent('Navigációs célpont')}&body=${encodeURIComponent(text)}`);
    return { success: true, message: `📍 Megnyitottam az emailt ${contact.name} részére a navigációs célponttal.`, data: { contact, destination: active.destination_address } };
  }

  return { success: false, message: `${contact.name} kontaktnál nincs telefon vagy email megadva.` };
}

export function getFrequentDestinationSuggestion() {
  return loadDestinationCache()[0] || null;
}

export function getTrackingModeOptions() {
  return ['LOW_POWER', 'BALANCED', 'HIGH_ACCURACY'];
}

export function setTrackingMode(mode) {
  const active = getActiveRoute();
  if (!active) {
    setRouteTrackingState({ trackingMode: mode });
    return;
  }
  const nextSession = { ...active, tracking_mode: mode, last_update_at: nowIso() };
  setActiveRoute(nextSession);
  if (mode === 'HIGH_ACCURACY') highAccuracyUntil = Date.now() + CONFIG.GPS_HIGH_ACCURACY_MAX_MS;
  startWatchIfNeeded(nextSession);
}

export function restoreActiveRouteSession() {
  const active = getActiveRoute();
  if (!active) return null;
  setRouteTrackingState({ activeSession: active, trackingMode: active.tracking_mode || CONFIG.ROUTE_TRACKING_MODE });
  startWatchIfNeeded(active);
  return active;
}

export function handleRouteLifecycle() {
  const onVisibilityChange = () => {
    const active = getActiveRoute();
    if (!active) return;
    if (document.hidden) {
      stopRouteTracking();
      setRouteTrackingState({ gpsStatus: 'battery_safe' });
      return;
    }
    startWatchIfNeeded(active);
  };

  const onOnline = () => syncRouteQueue();

  document.addEventListener('visibilitychange', onVisibilityChange);
  const unsubscribe = networkMonitor.subscribe((online) => {
    if (online) onOnline();
    const active = getActiveRoute();
    if (active) {
      setRouteTrackingState({ activeSession: { ...active, sync_status: online ? 'pending' : 'offline' } });
    }
  });

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    unsubscribe();
    stopRouteTracking();
  };
}

export function getRouteSyncStatus() {
  return getRouteTrackingState();
}

export function retryRouteSync() {
  return retryFailedRouteSync();
}