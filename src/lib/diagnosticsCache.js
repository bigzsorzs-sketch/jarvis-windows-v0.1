// IndexedDB management for offline diagnostics database

const DB_NAME = 'AutomotiveDiagnosticsDB';
const DB_VERSION = 1;
const VEHICLE_STORE = 'vehicles';
const DTC_STORE = 'dtcDatabase';

let db = null;

export async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Vehicle profiles store
      if (!database.objectStoreNames.contains(VEHICLE_STORE)) {
        const vehicleStore = database.createObjectStore(VEHICLE_STORE, { keyPath: 'vin' });
        vehicleStore.createIndex('year', 'year', { unique: false });
        vehicleStore.createIndex('manufacturer', 'manufacturer', { unique: false });
      }

      // DTC database store
      if (!database.objectStoreNames.contains(DTC_STORE)) {
        const dtcStore = database.createObjectStore(DTC_STORE, { keyPath: 'code' });
        dtcStore.createIndex('category', 'category', { unique: false });
      }
    };
  });
}

export async function cacheVehicleProfile(vehicleData) {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VEHICLE_STORE, 'readwrite');
    const store = tx.objectStore(VEHICLE_STORE);
    const request = store.put({
      ...vehicleData,
      cachedAt: new Date().toISOString(),
    });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function getVehicleProfile(vin) {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VEHICLE_STORE, 'readonly');
    const store = tx.objectStore(VEHICLE_STORE);
    const request = store.get(vin);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function getAllVehicles() {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VEHICLE_STORE, 'readonly');
    const store = tx.objectStore(VEHICLE_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function cacheDTCDatabase(dtcArray) {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DTC_STORE, 'readwrite');
    const store = tx.objectStore(DTC_STORE);

    // Clear old data
    store.clear();

    // Add new DTCs
    let count = 0;
    dtcArray.forEach((dtc) => {
      const request = store.add({
        ...dtc,
        cachedAt: new Date().toISOString(),
      });

      request.onsuccess = () => {
        count++;
        if (count === dtcArray.length) {
          resolve(count);
        }
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function getDTCInfo(code) {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DTC_STORE, 'readonly');
    const store = tx.objectStore(DTC_STORE);
    const request = store.get(code);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function searchDTC(query) {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DTC_STORE, 'readonly');
    const store = tx.objectStore(DTC_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const results = request.result.filter(
        (dtc) =>
          dtc.code.includes(query.toUpperCase()) ||
          dtc.description?.toUpperCase().includes(query.toUpperCase()) ||
          dtc.causes?.some((c) => c.toUpperCase().includes(query.toUpperCase()))
      );
      resolve(results);
    };
  });
}

export async function clearAllData() {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([VEHICLE_STORE, DTC_STORE], 'readwrite');

    tx.objectStore(VEHICLE_STORE).clear();
    tx.objectStore(DTC_STORE).clear();

    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve(true);
  });
}