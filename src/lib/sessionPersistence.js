/**
 * Session Persistence — lightweight localStorage-based state restore.
 *
 * Stores: hands-free preference, detected language, last message count.
 * Does NOT store full message history (privacy + size).
 */

import { safeStorage } from '@/lib/safeStorage';

const KEY = 'jarvis_session_v1';

const defaults = {
  handsFree: false,
  detectedLang: 'hu',
  lastSavedAt: null,
};

export const sessionPersistence = {
  save(data) {
    try {
      const payload = { ...defaults, ...data, lastSavedAt: Date.now() };
      safeStorage.setItem(KEY, JSON.stringify(payload));
    } catch {}
  },

  load() {
    try {
      const raw = safeStorage.getItem(KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      // Don't restore hands-free if last save was more than 1 hour ago
      const age = Date.now() - (parsed.lastSavedAt || 0);
      if (age > 60 * 60 * 1000) return { ...defaults, detectedLang: parsed.detectedLang || 'hu' };
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  },

  clear() {
    safeStorage.removeItem(KEY);
  },
};

export default sessionPersistence;