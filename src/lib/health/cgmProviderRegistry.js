/**
 * Provider-agnostic CGM layer.
 *
 * Jarvis does not assume that a named CGM device can be read directly from
 * Bluetooth. Real provider adapters must explicitly report their availability.
 * A local-history provider and a clearly labelled demo provider are built in.
 */

import { jarvis } from '@/api/jarvisClient';

const providers = new Map();

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function trendFromReadings(readings = []) {
  if (readings.length < 2) return { direction: 'unknown', delta: null };
  const latest = Number(readings[0]?.value);
  const previous = Number(readings[1]?.value);
  if (!Number.isFinite(latest) || !Number.isFinite(previous)) return { direction: 'unknown', delta: null };
  const delta = Number((latest - previous).toFixed(1));
  if (delta >= 0.5) return { direction: 'rising', delta };
  if (delta <= -0.5) return { direction: 'falling', delta };
  return { direction: 'stable', delta };
}

const localHistoryProvider = {
  id: 'local-history',
  name: 'Jarvis local glucose history',
  mode: 'local',
  live: false,
  async getStatus() {
    return { available: true, connected: true, mode: 'local', live: false };
  },
  async getLatest() {
    const user = await jarvis.auth.me();
    const rows = await jarvis.entities.BloodSugar.filter(
      { created_by: user.email },
      '-created_date',
      2
    );
    if (!rows.length) return null;
    return { ...rows[0], trend: trendFromReadings(rows), provider: 'local-history', live: false };
  },
  async getHistory(limit = 24) {
    const user = await jarvis.auth.me();
    return jarvis.entities.BloodSugar.filter(
      { created_by: user.email },
      '-created_date',
      Math.max(1, Math.min(Number(limit) || 24, 288))
    );
  },
};

const DEMO_BASE = [6.2, 6.1, 6.0, 6.1, 6.4, 6.8, 7.1, 6.9, 6.6, 6.3, 6.1, 6.0];

const demoProvider = {
  id: 'demo-cgm',
  name: 'Professional CGM Demo',
  mode: 'demo',
  live: false,
  async getStatus() {
    return { available: true, connected: true, mode: 'demo', live: false, simulated: true };
  },
  async getLatest() {
    const history = await this.getHistory(12);
    return { ...history[0], trend: trendFromReadings(history), simulated: true, provider: 'demo-cgm' };
  },
  async getHistory(limit = 12) {
    const count = Math.max(2, Math.min(Number(limit) || 12, DEMO_BASE.length));
    const now = Date.now();
    return DEMO_BASE.slice(-count).reverse().map((value, index) => ({
      id: 'demo-' + index,
      value,
      unit: 'mmol/L',
      created_date: new Date(now - index * 5 * 60_000).toISOString(),
      source: 'simulated-demo',
      simulated: true,
    }));
  },
};

export function registerCGMProvider(provider) {
  if (!provider?.id || typeof provider.getStatus !== 'function' || typeof provider.getLatest !== 'function') {
    throw new Error('INVALID_CGM_PROVIDER');
  }
  providers.set(provider.id, provider);
  return () => providers.delete(provider.id);
}

export function listCGMProviders() {
  return [...providers.values()].map((provider) => ({
    id: provider.id,
    name: provider.name || provider.id,
    mode: provider.mode || 'external',
    live: Boolean(provider.live),
  }));
}

export async function getCGMProviderStatus(id) {
  const provider = providers.get(id);
  if (!provider) return { available: false, connected: false, reason: 'PROVIDER_NOT_REGISTERED' };
  return clone(await provider.getStatus());
}

export async function getLatestCGMReading(id = 'local-history') {
  const provider = providers.get(id);
  if (!provider) throw new Error('CGM_PROVIDER_NOT_REGISTERED:' + id);
  return clone(await provider.getLatest());
}

export async function getCGMHistory(id = 'local-history', limit = 24) {
  const provider = providers.get(id);
  if (!provider?.getHistory) return [];
  return clone(await provider.getHistory(limit));
}

registerCGMProvider(localHistoryProvider);
registerCGMProvider(demoProvider);
