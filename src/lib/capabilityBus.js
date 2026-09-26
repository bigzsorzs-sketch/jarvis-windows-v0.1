/**
 * Jarvis Capability Bus
 *
 * Shared runtime registry that lets the active module expose safe actions and live context
 * to the central voice/situation layer without hard-coding every feature into the chat.
 */

const modules = new Map();
let activeModuleId = null;
let lastInteraction = null;

function normalizeDescriptor(name, raw) {
  if (typeof raw === 'function') {
    return {
      name,
      description: name,
      risk: 'read',
      confirmationRequired: false,
      handler: raw,
    };
  }

  return {
    name,
    description: raw?.description || name,
    risk: raw?.risk || 'read',
    confirmationRequired: Boolean(raw?.confirmationRequired),
    handler: raw?.handler,
  };
}

export function registerJarvisModule({
  id,
  label,
  getContext = () => ({}),
  getActions = () => ({}),
  activate = true,
}) {
  if (!id) throw new Error('Jarvis module id is required');

  modules.set(id, {
    id,
    label: label || id,
    getContext,
    getActions,
    registeredAt: Date.now(),
  });

  if (activate) activeModuleId = id;

  return () => {
    modules.delete(id);
    if (activeModuleId === id) {
      const latest = [...modules.values()].sort((a, b) => b.registeredAt - a.registeredAt)[0];
      activeModuleId = latest?.id || null;
    }
  };
}

export function setActiveJarvisModule(id) {
  if (id && modules.has(id)) activeModuleId = id;
}

export function getActiveJarvisModule() {
  return activeModuleId ? modules.get(activeModuleId) || null : null;
}

export function getJarvisSituationContext() {
  const active = getActiveJarvisModule();
  let moduleContext = {};

  try {
    moduleContext = active?.getContext?.() || {};
  } catch {
    moduleContext = {};
  }

  return {
    activeModule: active ? { id: active.id, label: active.label } : null,
    moduleContext,
    lastInteraction,
  };
}

export function getCapabilityCatalog() {
  const active = getActiveJarvisModule();
  if (!active) return [];

  let actions = {};
  try {
    actions = active.getActions?.() || {};
  } catch {
    actions = {};
  }

  return Object.entries(actions).map(([name, raw]) => {
    const item = normalizeDescriptor(name, raw);
    return {
      name: item.name,
      description: item.description,
      risk: item.risk,
      confirmationRequired: item.confirmationRequired,
      moduleId: active.id,
    };
  });
}

export async function executeJarvisCapability(name, params = {}) {
  const active = getActiveJarvisModule();
  if (!active) return { handled: false, reason: 'NO_ACTIVE_MODULE' };

  let actions = {};
  try {
    actions = active.getActions?.() || {};
  } catch {
    actions = {};
  }

  const raw = actions[name];
  if (!raw) return { handled: false, reason: 'CAPABILITY_NOT_AVAILABLE' };

  const descriptor = normalizeDescriptor(name, raw);
  if (typeof descriptor.handler !== 'function') {
    return { handled: false, reason: 'CAPABILITY_HANDLER_MISSING' };
  }

  if (descriptor.confirmationRequired && params?.__confirmed !== true) {
    lastInteraction = {
      at: new Date().toISOString(),
      moduleId: active.id,
      capability: name,
      status: 'confirmation-required',
      params,
    };
    return {
      handled: true,
      confirmationRequired: true,
      capability: name,
      moduleId: active.id,
      reply: 'A(z) "' + descriptor.description + '" művelet megerősítést igényel.',
    };
  }

  const safeParams = { ...(params || {}) };
  delete safeParams.__confirmed;

  const clock = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const startedAt = clock();

  try {
    const result = await descriptor.handler(safeParams);
    const elapsedMs = Math.round(clock() - startedAt);

    lastInteraction = {
      at: new Date().toISOString(),
      moduleId: active.id,
      capability: name,
      status: result?.success === false ? 'failed' : 'completed',
      params: safeParams,
      elapsedMs,
      summary: result?.message || '',
    };

    return {
      handled: true,
      capability: name,
      moduleId: active.id,
      elapsedMs,
      result,
      reply: result?.message || 'Kész.',
    };
  } catch (error) {
    lastInteraction = {
      at: new Date().toISOString(),
      moduleId: active.id,
      capability: name,
      status: 'failed',
      params: safeParams,
      error: error?.message || String(error),
    };

    return {
      handled: true,
      capability: name,
      moduleId: active.id,
      error: error?.message || String(error),
      reply: 'A művelet most nem sikerült. Ellenőrizd a kapcsolatot és próbáld újra.',
    };
  }
}

export function getLastJarvisInteraction() {
  return lastInteraction ? { ...lastInteraction } : null;
}
