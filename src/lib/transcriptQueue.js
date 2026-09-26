/**
 * Non-blocking transcript queue for speech recognition — hardened edition.
 *
 * Features:
 *  - Max queue size with configurable overflow strategy (drop-oldest)
 *  - Debounce: rapid consecutive transcripts get merged if queue is near-full
 *  - Async drain never blocks the recognition onresult handler
 *  - Telemetry integration
 */

import { CONFIG } from '@/lib/appConfig';
import { telemetry } from '@/lib/speechTelemetry';
import { logger } from '@/lib/logger';

const MODULE = 'TranscriptQueue';

export class TranscriptQueue {
  constructor() {
    this._queue = [];
    this._processing = false;
    this._paused = false;
    this._handler = null;
    this._lastPushTime = 0;
  }

  /** Register the async handler that processes each transcript */
  setHandler(fn) {
    this._handler = fn;
  }

  /** Pause queue drain (e.g. when offline) */
  pause() { this._paused = true; }

  /** Resume queue drain and kick off processing */
  resume() {
    this._paused = false;
    if (this._queue.length > 0 && !this._processing) {
      queueMicrotask(() => this._drain());
    }
  }

  /** Called from onresult — SYNCHRONOUS, zero blocking work */
  push(transcript) {
    if (!transcript?.trim()) return;

    const now = Date.now();

    // ── Debounce: if queue already has items and last push was very recent,
    //    merge into the last item rather than stacking
    const timeSinceLast = now - this._lastPushTime;
    if (
      this._queue.length > 0 &&
      timeSinceLast < CONFIG.QUEUE_DEBOUNCE_MS
    ) {
      this._queue[this._queue.length - 1] += ' ' + transcript;
      this._lastPushTime = now;
      return;
    }

    // ── Overflow: drop oldest if at max capacity
    if (this._queue.length >= CONFIG.QUEUE_MAX_SIZE) {
      logger.warn(MODULE, `Queue overflow — dropping oldest (size: ${this._queue.length})`);
      telemetry.recordQueueOverflow();
      this._queue.shift();
    }

    this._queue.push(transcript);
    this._lastPushTime = now;

    // Schedule drain on next microtask so recognition loop is freed immediately
    if (!this._processing) {
      queueMicrotask(() => this._drain());
    }
  }

  async _drain() {
    if (this._processing || !this._handler || this._paused) return;
    this._processing = true;
    while (this._queue.length > 0) {
      const transcript = this._queue.shift();
      const start = Date.now();
      try {
        await this._handler(transcript);
        telemetry.recordLatency(Date.now() - start);
      } catch (err) {
        logger.error(MODULE, 'Handler error', { message: err?.message, stack: err?.stack });
        telemetry.recordWorkerError();
      }
      // Yield to browser between each item so UI stays responsive
      await new Promise(r => setTimeout(r, 0));
    }
    this._processing = false;
  }

  /** Hard clear — call on unmount or session reset */
  clear() {
    this._queue = [];
    this._lastPushTime = 0;
  }

  get size() {
    return this._queue.length;
  }

  get isProcessing() {
    return this._processing;
  }
}

export function createTranscriptQueue() {
  return new TranscriptQueue();
}

// Backward-compatible app-level queue for legacy callers.
export const transcriptQueue = createTranscriptQueue();