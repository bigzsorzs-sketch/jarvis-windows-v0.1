/**
 * Global API Throttler — rate limiting, caching, retry logic.
 * All constants are sourced from appConfig (single source of truth).
 */
import { CONFIG } from '@/lib/appConfig';
import { logger } from '@/lib/logger';
import { jarvis } from '@/api/jarvisClient';

const MODULE = 'apiThrottler';

// ─── CONSTANTS (from central config) ─────────────────────────────────────────
const THROTTLE_DELAY      = CONFIG.THROTTLE_DELAY;
const MAX_RETRIES         = CONFIG.MAX_RETRIES;
const RETRY_DELAY         = CONFIG.RETRY_BASE_DELAY;
const CACHE_TTL           = CONFIG.ENTITY_CACHE_TTL;
const USER_RATE_LIMIT     = CONFIG.USER_RATE_LIMIT;
const USER_WINDOW         = CONFIG.USER_RATE_WINDOW;
const BASE_CLEANUP_INTERVAL = CACHE_TTL * 2;
const MAX_CLEANUP_INTERVAL  = CACHE_TTL * 10;

// Cache key prefixes — centralised to avoid typos across consumers
export const CACHE_KEYS = {
  LIST:    (entity, sort, limit) => `list:${entity}:${sort}:${limit}`,
  ENTITY:  (entity, id)          => `entity:${entity}:${id}`,
  USER:    (userId, suffix)      => `user:${userId}:${suffix}`,
};

// ─── PERFORMANCE STATS ────────────────────────────────────────────────────────
const _stats = { hits: 0, misses: 0, evictions: 0 };

export function getCacheStats() {
  const total = _stats.hits + _stats.misses;
  return {
    ..._stats,
    hitRate: total > 0 ? ((_stats.hits / total) * 100).toFixed(1) + '%' : 'n/a',
    cacheSize: cache.size,
  };
}

// LRU-based cache with bounded memory (max 500 entries)
const MAX_CACHE_SIZE = 500;
class LRUCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const val = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, val); // move to end (most recently used)
    return val;
  }
  set(key, val) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, val);
    if (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
      _stats.evictions++;
    }
  }
  has(key) { return this.map.has(key); }
  delete(key) { return this.map.delete(key); }
  get size() { return this.map.size; }
  entries() { return this.map.entries(); }
  clear() { this.map.clear(); }
}

// FIXED: per-user lastCallTime map prevents global throttle bottleneck across users
const userLastCallTime = new Map(); // userId -> timestamp
let cache = new LRUCache(MAX_CACHE_SIZE);
let userCallCounts = new Map(); // userId -> { count, resetTime }

// Cleanup: rate limits only (LRU self-manages cache bounds)
function scheduleCleanup() {
  window.setTimeout(() => {
    const now = Date.now();
    for (const [userId, val] of userCallCounts.entries()) {
      if (now > val.resetTime) userCallCounts.delete(userId);
    }
    for (const [userId, ts] of userLastCallTime.entries()) {
      if (now - ts > THROTTLE_DELAY * 10) userLastCallTime.delete(userId);
    }
    scheduleCleanup();
  }, BASE_CLEANUP_INTERVAL);
}

if (typeof window !== 'undefined') {
  scheduleCleanup();
}

// Throttle queue
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// User-specific rate limiting
function checkUserRateLimit(userId) {
  const now = Date.now();
  const userLimit = userCallCounts.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    userCallCounts.set(userId, { count: 1, resetTime: now + USER_WINDOW });
    return true;
  }

  if (userLimit.count >= USER_RATE_LIMIT) {
    return false; // Rate limit exceeded
  }

  userLimit.count++;
  return true;
}

async function throttledCall(fn, cacheKey = null, userId = 'default') {
  // Check cache first
  if (cacheKey && cache.has(cacheKey)) {
    const { data, timestamp } = cache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      _stats.hits++;
      return data;
    }
    cache.delete(cacheKey);
    _stats.evictions++;
  }
  if (cacheKey) _stats.misses++;

  // Check user rate limit
  if (!checkUserRateLimit(userId)) {
    throw new Error(`Rate limit exceeded for user ${userId}`);
  }

  const now = Date.now();
  const lastCall = userLastCallTime.get(userId) || 0;
  const timeSinceLastCall = now - lastCall;
  if (timeSinceLastCall < THROTTLE_DELAY) {
    await sleep(THROTTLE_DELAY - timeSinceLastCall);
  }
  userLastCallTime.set(userId, Date.now());

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fn();
      if (cacheKey) {
        cache.set(cacheKey, { data: result, timestamp: Date.now() });
      }
      return result;
    } catch (err) {
      lastError = err;
      if (err?.response?.status === 429 || err?.message?.includes('429')) {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY * Math.pow(2, attempt));
          continue;
        }
      }
      if (cacheKey && cache.has(cacheKey)) {
        return cache.get(cacheKey).data;
      }
      if (attempt === MAX_RETRIES) {
        logger.warn(MODULE, `API call failed after ${MAX_RETRIES} retries`, { err: err?.message });
        return null;
      }
    }
  }

  throw lastError;
}

const PUBLIC_LIST_ALLOWLIST = new Set(['DiagnosticCode']);

export async function listEntity(entity, sort = '', limit = 100, cacheKey = null, userId = 'anon', options = {}) {
  const currentUser = await jarvis.auth.me().catch(() => null);
  const effectiveUserId = currentUser?.id || userId;
  const { userOwned = false, entityName = '' } = options;
  const fallbackKey = `list_${entityName || 'unknown'}_${sort}_${limit}`;
  const scopedKey = effectiveUserId !== 'anon'
    ? `${effectiveUserId}:${cacheKey || fallbackKey}`
    : (cacheKey || fallbackKey);

  return throttledCall(
    async () => {
      if (userOwned) {
        if (!entityName) throw new Error('entityName is required for user-owned listEntity');
        if (!currentUser?.email) throw new Error('Authentication required');
        return entity.filter({ created_by: currentUser.email }, sort, limit);
      }
      if (!PUBLIC_LIST_ALLOWLIST.has(entityName)) {
        throw new Error(`Explicit allowlist required for non-user-owned listEntity: ${entityName || 'unknown'}`);
      }
      return entity.list(sort, limit);
    },
    scopedKey,
    effectiveUserId
  );
}

// Entity create wrapper
export async function createEntity(entity, data) {
  return throttledCall(() => entity.create(data));
}

// Entity update wrapper
export async function updateEntity(entity, id, data) {
  return throttledCall(() => entity.update(id, data));
}

// Entity delete wrapper
export async function deleteEntity(entity, id) {
  return throttledCall(() => entity.delete(id));
}

// LLM call wrapper — routes through the unified llmGateway
export async function invokeAI(_integrations, params) {
  const { invokeWithRetry } = await import('@/lib/llmGateway');
  return invokeWithRetry(params);
}

// File upload wrapper — DEPRECATED, use validateFileUpload backend function instead
// QA-ONLY: If called, throws immediately to prevent production direct UploadFile usage
export async function uploadFile(integrations, file) {
  throw new Error('[FATAL] apiThrottler.uploadFile is deprecated. Use backend validateFileUpload function via jarvis.functions.invoke("validateFileUpload", formData) instead. This is a hard error to catch legacy code.');
}

// Clear cache
export function clearCache() {
  cache.clear();
}

// Get cache status
export function getCacheSize() {
  return cache.size;
}