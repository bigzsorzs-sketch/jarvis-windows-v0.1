// Real GPS Geofencing Engine
// Monitors user position and fires callbacks when entering/leaving saved zones.
// Only works while the app is open in the browser.

import { sendNotification } from './pushNotifications';

const POLL_INTERVAL_MS = 15000; // Check every 15 seconds
const TRIGGERED_COOLDOWN_MS = 5 * 60 * 1000; // 5 min cooldown per location

export class GeofenceEngine {
  constructor() {
    this.locations = []; // SavedLocation[] from DB
    this.watchId = null;
    this.currentPosition = null;
    this.recentlyTriggered = {}; // locationId -> timestamp
    this.onTrigger = null; // callback(location)
    this.isRunning = false;
    this._visibilityHandler = null;
    this._pageHideHandler = null;
  }

  setLocations(locations) {
    this.locations = locations;
  }

  setOnTrigger(callback) {
    this.onTrigger = callback;
  }

  start() {
    if (this.isRunning || !('geolocation' in navigator)) return false;
    this.isRunning = true;

    // Use lower accuracy to reduce battery drain; high accuracy only needed for tight zones
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.currentPosition = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        this._checkGeofences();
      },
      (err) => {
        console.warn('Geofence GPS error', { code: err?.code || 'unknown' });
        if (err.code === 1) this.stop();
      },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 }
    );

    // Stop watch when page is hidden/unloaded to release resources reliably
    this._visibilityHandler = () => {
      if (document.visibilityState === 'hidden') this._pauseWatch();
      else if (this.isRunning) this._resumeWatch();
    };
    this._pageHideHandler = () => this.stop();

    document.addEventListener('visibilitychange', this._visibilityHandler);
    window.addEventListener('pagehide', this._pageHideHandler);

    return true;
  }

  stop() {
    this._clearWatch();
    this._removeListeners();
    this.isRunning = false;
    this.currentPosition = null;
  }

  /** Pause GPS watch without resetting isRunning (used on tab hide) */
  _pauseWatch() {
    this._clearWatch();
  }

  /** Resume GPS watch after tab becomes visible again */
  _resumeWatch() {
    if (this.watchId !== null) return; // already watching
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.currentPosition = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };
        this._checkGeofences();
      },
      (err) => { console.warn('Geofence GPS error', { code: err?.code || 'unknown' }); if (err.code === 1) this.stop(); },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }

  _clearWatch() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  _removeListeners() {
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    if (this._pageHideHandler) {
      window.removeEventListener('pagehide', this._pageHideHandler);
      this._pageHideHandler = null;
    }
  }

  getCurrentPosition() {
    return this.currentPosition;
  }

  _checkGeofences() {
    if (!this.currentPosition || !this.locations.length) return;
    const now = Date.now();

    for (const loc of this.locations) {
      if (!loc.latitude || !loc.longitude) continue;

      const dist = this._haversine(
        this.currentPosition.lat,
        this.currentPosition.lon,
        loc.latitude,
        loc.longitude
      );

      const radius = loc.radius_meters || 200;

      if (dist <= radius) {
        // Inside zone — check cooldown
        const lastTriggered = this.recentlyTriggered[loc.id] || 0;
        if (now - lastTriggered > TRIGGERED_COOLDOWN_MS) {
          this.recentlyTriggered[loc.id] = now;
          this._trigger(loc, dist);
        }
      }
    }
  }

  _trigger(location, distanceM) {
    const message = location.reminder_message || `A(z) ${location.name} közelében vagy!`;
    const shoppingList = location.shopping_items?.length
      ? `\n🛒 Bevásárló: ${location.shopping_items.join(', ')}`
      : '';

    sendNotification(
      `📍 ${location.name}`,
      message + shoppingList,
      { tag: `geofence-${location.id}`, requireInteraction: true }
    );

    if (this.onTrigger) {
      this.onTrigger({ location, distanceM, message });
    }
  }

  // Haversine formula — distance in meters
  _haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

// Singleton instance
export const geofenceEngine = new GeofenceEngine();