/**
 * Image Cache with auto-revoke — FIX #9
 * Revokes blob URLs automatically when removed from cache
 * Prevents memory leaks from accumulated Object URLs
 */

class ImageCache {
  constructor(maxSize = 20) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.urlRefCounts = new Map(); // Track how many times each URL is referenced
  }

  set(key, url) {
    // Remove old entry if exists
    if (this.cache.has(key)) {
      this.decrementRef(this.cache.get(key));
    }

    // Add new entry
    this.cache.set(key, url);
    this.incrementRef(url);

    // Evict oldest if exceeds max size
    if (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      const oldUrl = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      this.decrementRef(oldUrl);
    }
  }

  get(key) {
    return this.cache.get(key);
  }

  has(key) {
    return this.cache.has(key);
  }

  delete(key) {
    if (this.cache.has(key)) {
      const url = this.cache.get(key);
      this.cache.delete(key);
      this.decrementRef(url);
    }
  }

  incrementRef(url) {
    const count = this.urlRefCounts.get(url) || 0;
    this.urlRefCounts.set(url, count + 1);
  }

  decrementRef(url) {
    const count = this.urlRefCounts.get(url) || 1;
    if (count <= 1) {
      // Last reference removed — revoke the URL
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.warn(`[ImageCache] Failed to revoke URL: ${e.message}`);
      }
      this.urlRefCounts.delete(url);
    } else {
      this.urlRefCounts.set(url, count - 1);
    }
  }

  clear() {
    // Revoke all URLs
    for (const url of this.urlRefCounts.keys()) {
      try {
        URL.revokeObjectURL(url);
      } catch { }
    }
    this.cache.clear();
    this.urlRefCounts.clear();
  }
}

export const imageCache = new ImageCache(20);