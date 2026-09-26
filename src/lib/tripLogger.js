// Trip recording and logging system
export class TripLogger {
  constructor() {
    this.isRecording = false;
    this.tripData = {
      startTime: null,
      endTime: null,
      coordinates: [],
      obd2Data: [],
      distance: 0,
    };
    this.geoWatchId = null;
    this.lastCoordinate = null;
  }

  startTrip() {
    if (this.isRecording) return;

    this.isRecording = true;
    this.tripData = {
      startTime: new Date().toISOString(),
      endTime: null,
      coordinates: [],
      obd2Data: [],
      distance: 0,
    };

    // Watch geolocation
    if ('geolocation' in navigator) {
      this.geoWatchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          const timestamp = new Date().toISOString();

          const coordinate = {
            lat: latitude,
            lon: longitude,
            accuracy,
            timestamp,
          };

          // Calculate distance
          if (this.lastCoordinate) {
            const distance = this.calculateDistance(
              this.lastCoordinate,
              coordinate
            );
            this.tripData.distance += distance;
          }

          this.tripData.coordinates.push(coordinate);
          this.lastCoordinate = coordinate;
        },
        (error) => console.error('Geo error:', error),
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 10000,
        }
      );
    }

    return this.tripData;
  }

  addOBD2Data(metric, value, unit) {
    if (!this.isRecording) return;

    this.tripData.obd2Data.push({
      metric,
      value,
      unit,
      timestamp: new Date().toISOString(),
      coordinate:
        this.tripData.coordinates[this.tripData.coordinates.length - 1] || null,
    });
  }

  endTrip() {
    if (!this.isRecording) return;

    this.isRecording = false;
    this.tripData.endTime = new Date().toISOString();

    if (this.geoWatchId !== null) {
      navigator.geolocation.clearWatch(this.geoWatchId);
    }

    return this.tripData;
  }

  calculateDistance(from, to) {
    const R = 6371; // Earth radius in km
    const dLat = ((to.lat - from.lat) * Math.PI) / 180;
    const dLon = ((to.lon - from.lon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((from.lat * Math.PI) / 180) *
        Math.cos((to.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  getTripData() {
    return this.tripData;
  }

  isActive() {
    return this.isRecording;
  }
}

// IndexedDB storage for trips
const DB_NAME = 'TripsDB';
const STORE_NAME = 'trips';

export async function initTripsDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('startTime', 'startTime', { unique: false });
      }
    };
  });
}

export async function saveTrip(tripData) {
  const db = await initTripsDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const trip = {
      ...tripData,
      savedAt: new Date().toISOString(),
    };

    const request = store.add(trip);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function getTrips() {
  const db = await initTripsDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('startTime');
    const request = index.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(request.result.reverse());
    };
  });
}

export async function getTrip(id) {
  const db = await initTripsDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function deleteTrip(id) {
  const db = await initTripsDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(true);
  });
}