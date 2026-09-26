/**
 * File cache utility to prevent duplicate uploads
 * Stores file URLs by hash to reuse in same session
 */

const fileCache = new Map(); // hash -> { url, timestamp }
const CACHE_TTL = 3600000; // 1 hour

export const getCachedFileUrl = (fileHash) => {
  const cached = fileCache.get(fileHash);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.url;
  }
  fileCache.delete(fileHash);
  return null;
};

export const setCachedFileUrl = (fileHash, url) => {
  fileCache.set(fileHash, { url, timestamp: Date.now() });
};

export const clearFileCache = () => {
  fileCache.clear();
};

export const getFileSHA256 = async (file) => {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};