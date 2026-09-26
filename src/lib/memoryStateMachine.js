// Memory State Machine - prevents leaks during long-running sessions
// Tracks pending operations and ensures cleanup

const STATES = {
  IDLE: 'idle',
  SAVING: 'saving',
  ERROR: 'error',
  CLEANING: 'cleaning'
};

class MemoryStateMachine {
  constructor() {
    this.state = STATES.IDLE;
    this.pendingOps = new Map(); // operationId -> { tool, params, timestamp }
    this.retryCount = new Map();
    this.MAX_RETRIES = 2;
    this.OP_TIMEOUT = 30000; // 30s timeout
  }

  canTransition(fromState, toState) {
    const transitions = {
      [STATES.IDLE]: [STATES.SAVING, STATES.CLEANING],
      [STATES.SAVING]: [STATES.IDLE, STATES.ERROR, STATES.CLEANING],
      [STATES.ERROR]: [STATES.SAVING, STATES.CLEANING],
      [STATES.CLEANING]: [STATES.IDLE]
    };
    return transitions[fromState]?.includes(toState) ?? false;
  }

  transition(toState) {
    if (!this.canTransition(this.state, toState)) {
      throw new Error(`Invalid transition: ${this.state} -> ${toState}`);
    }
    this.state = toState;
  }

  async addOperation(opId, tool, params) {
    if (this.state !== STATES.IDLE && this.state !== STATES.SAVING) {
      throw new Error(`Cannot add operation in ${this.state} state`);
    }
    
    this.pendingOps.set(opId, { tool, params, timestamp: Date.now() });
    
    // Auto-timeout
    const timeout = setTimeout(() => {
      if (this.pendingOps.has(opId)) {
        this.pendingOps.delete(opId);
        this.retryCount.delete(opId);
      }
    }, this.OP_TIMEOUT);
    
    return timeout;
  }

  completeOperation(opId) {
    this.pendingOps.delete(opId);
    this.retryCount.delete(opId);
  }

  incrementRetry(opId) {
    const count = (this.retryCount.get(opId) || 0) + 1;
    this.retryCount.set(opId, count);
    return count <= this.MAX_RETRIES;
  }

  cleanup() {
    this.transition(STATES.CLEANING);
    const now = Date.now();
    
    // Remove stale operations (older than 60s)
    for (const [opId, op] of this.pendingOps.entries()) {
      if (now - op.timestamp > 60000) {
        this.pendingOps.delete(opId);
      }
    }
    
    this.retryCount.clear();
    this.transition(STATES.IDLE);
  }

  getPendingCount() {
    return this.pendingOps.size;
  }

  reset() {
    this.state = STATES.IDLE;
    this.pendingOps.clear();
    this.retryCount.clear();
  }
}

export const memoryStateMachine = new MemoryStateMachine();