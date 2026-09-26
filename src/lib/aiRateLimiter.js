/**
 * Simple rate limiter for AI API calls
 * Tracks requests per minute and warns user
 */

const requestLog = [];
const REQUESTS_PER_MINUTE = 30; // Conservative limit
const TIME_WINDOW = 60000; // 1 minute

export const checkRateLimit = () => {
  const now = Date.now();
  const recentRequests = requestLog.filter(time => now - time < TIME_WINDOW);
  
  return {
    remaining: Math.max(0, REQUESTS_PER_MINUTE - recentRequests.length),
    total: REQUESTS_PER_MINUTE,
    isLimited: recentRequests.length >= REQUESTS_PER_MINUTE,
  };
};

export const logRequest = () => {
  requestLog.push(Date.now());
};

export const getRateLimitWarning = () => {
  const { remaining, total, isLimited } = checkRateLimit();
  
  if (isLimited) {
    return `⚠️ Rate limit elérve (${total}/perc). Egy pillanat...`;
  }
  if (remaining < 5) {
    return `⚠️ Hamarosan eléri a rate limitet (${remaining}/${total} maradt)`;
  }
  return null;
};