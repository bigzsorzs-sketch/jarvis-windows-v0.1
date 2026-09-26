/**
 * Network Monitor — online/offline awareness for the speech/LLM pipeline.
 *
 * - Tracks current network state
 * - Notifies subscribers on change
 * - Provides isPaused() guard for queue and LLM calls
 */

import { telemetry } from '@/lib/speechTelemetry';
import { logger } from '@/lib/logger';

const MODULE = 'NetworkMonitor';

class NetworkMonitor {
  constructor() {
    this._online = navigator.onLine;
    this._listeners = new Set();
    this._bound_online = () => this._onChange(true);
    this._bound_offline = () => this._onChange(false);
    window.addEventListener('online', this._bound_online);
    window.addEventListener('offline', this._bound_offline);
  }

  _onChange(online) {
    if (this._online === online) return;
    this._online = online;
    logger.info(MODULE, online ? 'Back online' : 'Gone offline');
    telemetry.recordNetworkChange(online);
    this._listeners.forEach(fn => { try { fn(online); } catch {} });
  }

  /** Returns true if currently online */
  isOnline() { return this._online; }

  /** Returns true if offline (use to guard LLM calls) */
  isOffline() { return !this._online; }

  /** Subscribe to network state changes: fn(isOnline: boolean) */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  destroy() {
    window.removeEventListener('online', this._bound_online);
    window.removeEventListener('offline', this._bound_offline);
    this._listeners.clear();
  }
}

export const networkMonitor = new NetworkMonitor();
export default networkMonitor;