/**
 * Input/Output Sanitization Module
 * Provides unified sanitization for all assistant inputs/outputs
 * Prevents injection attacks and malformed data
 */

import { logger } from '@/lib/logger';

const MODULE = 'sanitization';

// Dangerous patterns that suggest prompt/code injection attempts.
const DANGEROUS_PATTERNS = [
  /(?:^|[\n\r])\s*system\s*:/gi,
  /ignore\s+(?:all\s+)?(?:previous|prior|above)?\s*(?:instructions?|rules?|prompt)/gi,
  /override\s+(?:system|developer|safety|instructions?|rules?)/gi,
  /break\s+out\s+of\s+(?:the\s+)?(?:system|prompt|rules)/gi,
  /execute\s+(?:shell|system|terminal|command)/gi,
  /eval\s*\(/gi,
  /\.prototype\./gi,
  /__proto__/gi,
  /constructor\s*\(/gi,
];

/**
 * Sanitize string input (user message, action params, etc.)
 */
export function sanitizeString(str, maxLen = 5000) {
  if (typeof str !== 'string') return '';

  let cleaned = str;

  // Remove null bytes
  cleaned = cleaned.replace(/\0/g, '');

  // Remove control characters but keep normal spacing.
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Check for dangerous patterns without blocking normal words.
  for (const pattern of DANGEROUS_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(cleaned)) {
      logger.warn(MODULE, 'Injection attempt detected', { pattern: pattern.toString() });
      return '[BLOCKED_CONTENT]';
    }
  }

  // Limit length
  return cleaned.slice(0, maxLen);
}

export function escapePromptValue(value, maxLen = 1000) {
  const cleaned = sanitizeString(String(value ?? ''), maxLen);
  return cleaned
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/**
 * Sanitize OBD2 telemetry data (automotive-specific)
 */
export function sanitizeOBD2Data(data) {
  if (!Array.isArray(data)) return [];

  const OBD2_SAFE_FIELDS = ['value', 'unit', 'timestamp', 'pid', 'name'];
  return data.map(point => {
    const sanitized = {};
    OBD2_SAFE_FIELDS.forEach(field => {
      if (field in point) {
        sanitized[field] = sanitizeString(String(point[field]));
      }
    });
    return sanitized;
  });
}

/**
 * Sanitize OBD2 diagnostic codes (P/C/B/U + 4 digits)
 */
export function sanitizeDiagnosticCode(code) {
  const cleaned = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[PCBU]\d{4}$/.test(cleaned)) {
    return cleaned;
  }
  return '';
}

/**
 * Sanitize object (recursive)
 */
export function sanitizeObject(obj, maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth) return null;
  if (typeof obj !== 'object' || obj === null) return obj;

  const sanitized = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip suspicious keys
    if (/^__/.test(key) || /constructor/.test(key)) {
      continue;
    }

    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'number') {
      sanitized[key] = isFinite(value) ? value : 0;
    } else if (typeof value === 'boolean') {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      sanitized[key] = value.slice(0, 100).map(v =>
        typeof v === 'string' ? sanitizeString(v) : v
      );
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value, maxDepth, currentDepth + 1);
    }
  }

  return sanitized;
}

/**
 * Sanitize API response (Gemini, etc.)
 */
export function sanitizeApiResponse(response) {
  if (typeof response === 'string') {
    return sanitizeString(response);
  }

  if (typeof response === 'object' && response !== null) {
    return sanitizeObject(response);
  }

  return response;
}

/**
 * Validate action structure before execution
 */
export function validateAction(action) {
  if (!action || typeof action !== 'object') {
    logger.warn(MODULE, 'Invalid action structure', { action });
    return false;
  }

  if (typeof action.tool !== 'string' || !action.tool.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
    logger.warn(MODULE, 'Invalid tool name', { tool: action.tool });
    return false;
  }

  if (action.params && typeof action.params !== 'object') {
    logger.warn(MODULE, 'Invalid params', { params: action.params });
    return false;
  }

  return true;
}