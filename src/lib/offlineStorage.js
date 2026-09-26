import { logger } from '@/lib/logger';

// Local storage for user vehicle profiles and settings

const STORAGE_KEY = 'automotive_diagnostics_profiles';
const MAX_LOCAL_PROFILES = 50;

export function saveVehicleProfileLocally(profile) {
  try {
    const profiles = getLocalProfiles();
    const index = profiles.findIndex((p) => p.vin === profile.vin);

    if (index >= 0) {
      profiles[index] = { ...profiles[index], ...profile };
    } else {
      profiles.push(profile);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles.slice(-MAX_LOCAL_PROFILES)));
    return true;
  } catch (error) {
    logger.warn('offlineStorage', 'Storage write failed', { message: error?.message });
    return false;
  }
}

export function getLocalProfiles() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    logger.warn('offlineStorage', 'Storage read failed', { message: error?.message });
    return [];
  }
}

export function getLocalProfile(vin) {
  return getLocalProfiles().find((p) => p.vin === vin);
}

export function deleteLocalProfile(vin) {
  try {
    const profiles = getLocalProfiles().filter((p) => p.vin !== vin);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    return true;
  } catch (error) {
    logger.warn('offlineStorage', 'Storage delete failed', { message: error?.message });
    return false;
  }
}

export function getStorageStats() {
  try {
    const profiles = getLocalProfiles();
    const storageUsed = new Blob([localStorage.getItem(STORAGE_KEY) || '']).size;
    
    return {
      vehicleCount: profiles.length,
      storageUsedKB: (storageUsed / 1024).toFixed(2),
      profiles,
    };
  } catch (error) {
    return { vehicleCount: 0, storageUsedKB: 0, profiles: [] };
  }
}