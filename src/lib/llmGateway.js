/**
 * LLM Gateway — strict single-flight request routing.
 * Prevents overlapping LLM calls and validates token limits synchronously.
 */

import { jarvis } from '@/api/jarvisClient';
import { logger } from '@/lib/logger';
import { CONFIG } from '@/lib/appConfig';
import { estimateTokens } from '@/lib/tokenCounter';

const MODULE = 'llmGateway';
const MAX_QUEUE_SIZE = 50;

function validateLlmParams(params) {
  const prompt = typeof params?.prompt === 'string' ? params.prompt : '';
  const estimatedTokens = estimateTokens(prompt, 'hu');
  const maxTokens = Math.ceil(CONFIG.MAX_PROMPT_LENGTH / 2);

  if (!prompt.trim()) throw new Error('Empty LLM prompt');
  if (prompt.length > CONFIG.MAX_PROMPT_LENGTH || estimatedTokens > maxTokens) {
    throw new Error('LLM prompt exceeds the allowed token limit');
  }

  return { ...params };
}

class LlmRequestQueue {
  constructor() {
    this.queue = [];
    this.processingPromise = null;
    this.activeKeys = new Set();
  }

  enqueue(invoke, key = 'default') {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= MAX_QUEUE_SIZE) {
        reject(new Error('Request queue is full'));
        return;
      }
      if (this.activeKeys.has(key) || this.queue.some((item) => item.key === key)) {
        reject(new Error('Assistant request already in progress'));
        return;
      }

      this.queue.push({ invoke, resolve, reject, key });
      if (!this.processingPromise) {
        this.processingPromise = this.processQueue().finally(() => {
          this.processingPromise = null;
          if (this.queue.length > 0) this.processingPromise = this.processQueue();
        });
      }
    });
  }

  async processQueue() {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      this.activeKeys.add(item.key);
      try {
        const result = await item.invoke();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      } finally {
        this.activeKeys.delete(item.key);
      }
    }
  }
}

export function createLlmGateway() {
  const requestQueue = new LlmRequestQueue();

  return {
    async invokeWithRetry(params, maxRetries = 3) {
      const safeParams = validateLlmParams(params);
      const queueKey = safeParams.queueKey || 'default';
      delete safeParams.queueKey;
      const imageGeneration = safeParams.is_image_generation === true;
      delete safeParams.is_image_generation;
      let lastError;

      for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        try {
          const result = await requestQueue.enqueue(
            () => imageGeneration
              ? jarvis.integrations.Core.GenerateImage(safeParams)
              : jarvis.functions.invoke('llmProxy', safeParams),
            queueKey
          );
          if (imageGeneration) {
            if (!result?.url) throw new Error('Empty image response from generator');
          } else if (!result?.data) {
            throw new Error('Empty response from LLM');
          }
          if (attempt > 0) logger.info(MODULE, 'LLM request recovered after retry', { attempt: attempt + 1 });
          return result;
        } catch (err) {
          lastError = err;
          const is429 = err?.response?.status === 429 || err?.message?.includes('429');
          const isTooManyRequests = is429 || err?.message?.includes('Too many');

          logger.warn(MODULE, 'LLM request attempt failed', {
            attempt: attempt + 1,
            maxRetries,
            retryable: isTooManyRequests,
            error: err?.message,
          });

          if (isTooManyRequests && attempt < maxRetries - 1) {
            const jitter = crypto.getRandomValues(new Uint32Array(1))[0] % 500;
            const backoffMs = Math.pow(2, attempt) * 1000 + jitter;
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }

          logger.error(MODULE, 'LLM request failed permanently', { message: err?.message, stack: err?.stack });
          throw err;
        }
      }

      throw lastError || new Error('LLM request failed after retries');
    },
  };
}

const defaultGateway = createLlmGateway();

export function invokeWithRetry(params, maxRetries = 3) {
  return defaultGateway.invokeWithRetry(params, maxRetries);
}

export default defaultGateway;