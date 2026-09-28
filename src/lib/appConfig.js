/**
 * Central application configuration.
 * All tunable constants live here — import from this file, never hardcode.
 */

export const CONFIG = {
  // ── Cache TTLs (ms) ──────────────────────────────────────────────────────
  CONTEXT_CACHE_TTL:    5 * 60 * 1000,   // 5 min — full user context
  ENTITY_CACHE_TTL:     60 * 1000,        // 1 min — individual entity lists
  CONTEXT_CACHE_CLEAN:  10 * 60 * 1000,  // 10 min — gc interval

  // ── API Throttling ───────────────────────────────────────────────────────
  THROTTLE_DELAY:       350,              // ms between consecutive calls per user
  MAX_RETRIES:          2,
  RETRY_BASE_DELAY:     1000,             // ms — doubles each retry
  USER_RATE_LIMIT:      100,              // max API calls per user per window
  USER_RATE_WINDOW:     60 * 1000,        // 1 min

  // ── LLM limits ───────────────────────────────────────────────────────────
  MAX_PROMPT_LENGTH:    20000,            // chars
  MAX_FILE_URLS:        10,
  MAX_HISTORY_CHARS:    12000,

  // ── Speech / TTS ─────────────────────────────────────────────────────────
  SPEECH_RESTART_DELAY:   300,           // ms after onend before restarting recognition
  SPEECH_RESUME_DELAY:    500,           // ms after TTS ends before resuming mic
  SPEECH_WATCHDOG_MS:     8000,          // ms silence before watchdog triggers restart
  SPEECH_WATCHDOG_CHECK:  2000,          // ms interval for watchdog heartbeat check
  SPEECH_MAX_SESSION_MS:  30 * 60 * 1000, // 30 min — proactive reset for long sessions
  MOOD_TIMEOUT_MS:        3000,          // ms — mood LLM call hard timeout

  // ── Queue Protection ─────────────────────────────────────────────────────
  QUEUE_MAX_SIZE:         10,            // max transcripts in queue before overflow
  QUEUE_DEBOUNCE_MS:      1500,          // ms — merge rapid transcripts if queue full

  // ── Notifications ────────────────────────────────────────────────────────
  NOTIF_MIN_INTERVAL:   5 * 60 * 1000,  // 5 min minimum between checks
  NOTIF_MAX_INTERVAL:   30 * 60 * 1000, // 30 min max backoff
  NOTIF_BACKOFF_FACTOR: 2,
  NOTIF_TTL:            24 * 60 * 60 * 1000, // 24h — shown-tag dedup window
  NOTIF_MAX_STORED:     50,

  // ── Self-Healing ─────────────────────────────────────────────────────────
  SELF_HEAL_WINDOW_MS:    60 * 1000,  // rolling window for threshold checks
  SELF_HEAL_COOLDOWN_MS:  30 * 1000,  // min interval between heals

  // ── Fallback / Degraded Mode ─────────────────────────────────────────────
  LLM_TIMEOUT_MS:         15000,      // ms — hard timeout for LLM calls before fallback
  FALLBACK_OFFLINE_MSG:   '📡 Offline mód — a hangfelismerés aktív, de az AI válaszok szünetelnek.',

  // ── Session Persistence ──────────────────────────────────────────────────
  SESSION_RESTORE_MAX_AGE: 60 * 60 * 1000, // 1h — don't restore state older than this

  // ── Route Tracking ───────────────────────────────────────────────────────
  ROUTE_TRACKING_MODE: 'LOW_POWER',
  GPS_MIN_INTERVAL_MS: 45000,
  GPS_MIN_DISTANCE_M: 150,
  GPS_HIGH_ACCURACY_MAX_MS: 15 * 60 * 1000,
  ROUTE_SESSION_TIMEOUT_MS: 2 * 60 * 60 * 1000,
  ROUTE_LOW_POWER_SESSION_TIMEOUT_MS: 12 * 60 * 60 * 1000,
  ROUTE_PROXIMITY_M: 150,
  ROUTE_QUEUE_MAX_RETRIES: 5,
  ROUTE_QUEUE_BACKOFF_MS: 1500,
  ROUTE_UI_REFRESH_MS: 5000,

  // ── Canvas / Serialization ───────────────────────────────────────────────
  THUMBNAIL_W:          240,
  THUMBNAIL_H:          160,
  THUMBNAIL_QUALITY:    0.6,
  MAX_LRU_CACHE:        500,
};

export default CONFIG;