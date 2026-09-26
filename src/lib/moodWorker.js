/**
 * Mood Analyzer — hardened edition.
 *
 * - Fire-and-forget: caller never awaits
 * - Hard timeout prevents stalls
 * - Crash counter with automatic cooldown (no runaway LLM calls)
 * - Falls back to 'neutral' silently on any failure
 * - Telemetry integration
 */

import { CONFIG } from '@/lib/appConfig';
import { telemetry } from '@/lib/speechTelemetry';
import { invokeWithRetry } from '@/lib/llmGateway';

const VALID_MOODS = ['happy', 'sad', 'angry', 'confused', 'calm', 'neutral'];
const MAX_CONSECUTIVE_ERRORS = 5;
const ERROR_COOLDOWN_MS = 30_000; // 30s pause after repeated crashes

let _errorCount = 0;
let _coolingDownUntil = 0;

function resetErrorCount() {
  _errorCount = 0;
}

/**
 * Analyze mood asynchronously, completely non-blocking.
 * @param {string} text - transcript to analyze
 * @param {Function} onResult - callback(mood: string) called when done
 */
export function analyzeMoodAsync(text, onResult) {
  if (!text || text.length < 3) {
    onResult?.('neutral');
    return;
  }

  // Cooldown guard — too many consecutive errors → skip for a while
  if (Date.now() < _coolingDownUntil) {
    onResult?.('neutral');
    return;
  }

  // FIX #7: Add timeout wrapper to moodWorker (2s max)
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('mood_timeout')), 2000)
  );

  const analysis = (async () => {
    try {
      const result = await invokeWithRetry({
        prompt: `Classify the mood of this text in ONE word: happy, sad, angry, confused, calm, or neutral.\nText: "${text.substring(0, 150)}"\nReply ONLY with the mood word.`,
      });
      return typeof result === 'string' ? result : 'neutral';
    } catch {
      return 'neutral';
    }
  })();

  Promise.race([analysis, timeout])
    .then(mood => {
      const detected = (typeof mood === 'string' ? mood : 'neutral').toLowerCase().trim();
      resetErrorCount();
      onResult?.(VALID_MOODS.includes(detected) ? detected : 'neutral');
    })
    .catch(() => {
      _errorCount++;
      telemetry.recordWorkerError();
      if (_errorCount >= MAX_CONSECUTIVE_ERRORS) {
        _coolingDownUntil = Date.now() + ERROR_COOLDOWN_MS;
        console.warn(`[MoodWorker] Too many errors — cooling down for ${ERROR_COOLDOWN_MS / 1000}s`);
        _errorCount = 0;
      }
      onResult?.('neutral'); // silent fallback — NEVER crash recognition
    });
}