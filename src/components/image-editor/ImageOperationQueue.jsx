/**
 * Image Operation Queue — FIX #8
 * Prevents concurrent image operations (enhance + rotate + mask simultaneously)
 * Ensures canvas state consistency
 */

class ImageOperationQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  async enqueue(operationFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn: operationFn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;
    const { fn, resolve, reject } = this.queue.shift();
    
    try {
      const result = await fn();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.isProcessing = false;
      this.process(); // Process next in queue
    }
  }

  isRunning() {
    return this.isProcessing;
  }

  clear() {
    this.queue = [];
    this.isProcessing = false;
  }
}

export const imageOpQueue = new ImageOperationQueue();