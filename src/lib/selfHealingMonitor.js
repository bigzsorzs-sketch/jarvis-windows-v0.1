/**
 * Self-Healing Monitor
 *
 * Tracks health metrics and triggers a soft reset if thresholds are exceeded:
 *  - Too many speech restarts in a short window
 *  - Too many worker crashes
 *  - Too many queue overflows
 *
 * Soft reset: clears queue + rebuilds speech + notifies caller.
 */

import { CONFIG } from '@/lib/appConfig';
import { telemetry } from '@/lib/speechTelemetry';
import { logger } from '@/lib/logger';

const MODULE = 'SelfHealingMonitor';

// Thresholds within a rolling window
const WINDOW_MS         = 60_000;  // 1 minute rolling window
const MAX_RESTARTS      = 8;       // >8 restarts/min → heal
const MAX_WORKER_ERRORS = 6;       // >6 worker errors/min → heal
const MAX_OVERFLOWS     = 5;       // >5 overflows/min → heal
const HEAL_COOLDOWN_MS  = 30_000;  // min 30s between heals

class SelfHealingMonitor {
  constructor() {
    this._restarts    = [];   // timestamps
    this._workerErrs  = [];
    this._overflows   = [];
    this._lastHealAt  = 0;
    this._onHeal      = null; // callback: (reason: string) => void
  }

  /** Register the heal callback */
  setHealCallback(fn) { this._onHeal = fn; }

  recordRestart() {
    this._restarts.push(Date.now());
    this._check();
  }

  recordWorkerError() {
    this._workerErrs.push(Date.now());
    this._check();
  }

  recordOverflow() {
    this._overflows.push(Date.now());
    this._check();
  }

  _prune(arr) {
    const cutoff = Date.now() - WINDOW_MS;
    return arr.filter(t => t > cutoff);
  }

  _check() {
    this._restarts   = this._prune(this._restarts);
    this._workerErrs = this._prune(this._workerErrs);
    this._overflows  = this._prune(this._overflows);

    const now = Date.now();
    if (now - this._lastHealAt < HEAL_COOLDOWN_MS) return;

    let reason = null;
    if (this._restarts.length   > MAX_RESTARTS)      reason = `restart_storm (${this._restarts.length}/min)`;
    if (this._workerErrs.length > MAX_WORKER_ERRORS) reason = `worker_crash_storm (${this._workerErrs.length}/min)`;
    if (this._overflows.length  > MAX_OVERFLOWS)     reason = `queue_overflow_storm (${this._overflows.length}/min)`;

    if (reason) {
      this._lastHealAt = now;
      logger.warn(MODULE, `Soft reset triggered: ${reason}`);
      telemetry.recordSelfHeal(reason);
      this._restarts = [];
      this._workerErrs = [];
      this._overflows = [];
      try { this._onHeal?.(reason); } catch {}
    }
  }

  reset() {
    this._restarts = [];
    this._workerErrs = [];
    this._overflows = [];
  }
}

export const selfHealingMonitor = new SelfHealingMonitor();
export default selfHealingMonitor;