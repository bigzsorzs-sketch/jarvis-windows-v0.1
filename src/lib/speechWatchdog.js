/**
 * Speech Recognition Watchdog
 *
 * Monitors the recognition loop for stalls. If no onresult/onend event
 * arrives within WATCHDOG_MS, it forces a restart.
 *
 * Also handles the periodic long-session reset to prevent browser memory
 * buildup from a single long-lived SpeechRecognition instance.
 */

import { CONFIG } from '@/lib/appConfig';
import { telemetry } from '@/lib/speechTelemetry';
import { logger } from '@/lib/logger';

const MODULE = 'SpeechWatchdog';

export class SpeechWatchdog {
  constructor(onRestart) {
    this._onRestart = onRestart;       // callback: (reason: string) => void
    this._watchdogTimer = null;
    this._sessionTimer = null;
    this._enabled = false;
    this._lastHeartbeat = 0;
  }

  /** Start watchdog — call when hands-free mode activates */
  start() {
    if (this._enabled) return;
    this._enabled = true;
    this._lastHeartbeat = Date.now();
    this._scheduleCheck();
    this._scheduleSessionReset();
    logger.info(MODULE, 'Watchdog started');
  }

  /** Stop watchdog — call when hands-free deactivates */
  stop() {
    this._enabled = false;
    clearTimeout(this._watchdogTimer);
    clearTimeout(this._sessionTimer);
    this._watchdogTimer = null;
    this._sessionTimer = null;
    logger.info(MODULE, 'Watchdog stopped');
  }

  /** Call this whenever recognition proves alive (onresult, onstart, onend) */
  heartbeat() {
    this._lastHeartbeat = Date.now();
    telemetry.recordActivity();
  }

  _scheduleCheck() {
    if (!this._enabled) return;
    this._watchdogTimer = setTimeout(() => {
      if (!this._enabled) return;
      const silentMs = Date.now() - this._lastHeartbeat;
      if (silentMs >= CONFIG.SPEECH_WATCHDOG_MS) {
        logger.warn(MODULE, `No activity for ${silentMs}ms — triggering restart`);
        telemetry.recordWatchdog();
        this._onRestart('watchdog_timeout');
        this._lastHeartbeat = Date.now(); // reset after restart
      }
      this._scheduleCheck(); // reschedule
    }, CONFIG.SPEECH_WATCHDOG_CHECK);
  }

  _scheduleSessionReset() {
    if (!this._enabled) return;
    this._sessionTimer = setTimeout(() => {
      if (!this._enabled) return;
      logger.info(MODULE, 'Long session reset triggered');
      this._onRestart('session_reset');
      // Reschedule for next period
      this._scheduleSessionReset();
    }, CONFIG.SPEECH_MAX_SESSION_MS);
  }
}