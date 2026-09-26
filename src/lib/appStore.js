import { useSyncExternalStore } from 'react';

function createSimpleStore(initializer) {
  let state;
  const listeners = new Set();

  const setState = (partial) => {
    const nextState = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...nextState };
    listeners.forEach((listener) => listener());
  };

  const getState = () => state;

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const useStore = (selector = (current) => current) => useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state)
  );

  useStore.getState = getState;
  useStore.setState = setState;
  useStore.subscribe = subscribe;

  state = initializer(setState, getState);
  return useStore;
}

export const useVoiceStore = createSimpleStore((set) => ({
  phase: 'idle',
  handsFree: false,
  lastTranscript: '',
  lastError: null,
  setPhase: (phase) => set({ phase }),
  setHandsFree: (handsFree) => set({ handsFree }),
  setLastTranscript: (lastTranscript) => set({ lastTranscript }),
  setLastError: (lastError) => set({ lastError }),
}));

export const useUserStore = createSimpleStore((set) => ({
  user: null,
  isAuthenticated: false,
  authError: null,
  setUserState: (payload) => set(payload),
}));

export const useHealthStore = createSimpleStore((set) => ({
  bloodSugars: [],
  meals: [],
  medications: [],
  setHealthState: (payload) => set(payload),
}));

export const useFinanceStore = createSimpleStore((set) => ({
  entries: [],
  setFinanceState: (payload) => set(payload),
}));

export const useSystemStore = createSimpleStore((set) => ({
  isOnline: true,
  degradedMode: false,
  llmLatencyMs: 0,
  auditFailures: 0,
  setSystemState: (payload) => set(payload),
}));