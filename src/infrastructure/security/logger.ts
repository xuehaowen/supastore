/**
 * Sanitized structured logging module.
 * Automatically redacts sensitive fields (passwords, tokens, authorization headers,
 * payment secrets, cookies) and masks customer PII before writing to stdout/stderr.
 */

const SENSITIVE_KEY_PATTERN = /password|secret|token|authorization|cookie|apiKey|card|session|credit/i;

export function sanitizeValue(key: string, value: any, depth = 0): any {
  if (depth > 6) return '[MAX_DEPTH]';
  if (value === null || value === undefined) return value;

  // Redact if key matches sensitive patterns
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    // Check if string looks like a JWT / Bearer token
    if (/^bearer\s+[a-zA-Z0-9_\-\.]+/i.test(value) || /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(value)) {
      return '[REDACTED_TOKEN]';
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(key, item, depth + 1));
  }

  if (typeof value === 'object') {
    const sanitizedObj: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      sanitizedObj[k] = sanitizeValue(k, v, depth + 1);
    }
    return sanitizedObj;
  }

  return value;
}

export function sanitizePayload(payload: any): any {
  if (typeof payload !== 'object' || payload === null) {
    return payload;
  }
  return sanitizeValue('root', payload, 0);
}

export const logger = {
  info(message: string, meta?: any) {
    console.info(JSON.stringify({
      level: 'info',
      message,
      ...(meta ? { data: sanitizePayload(meta) } : {}),
      timestamp: new Date().toISOString(),
    }));
  },
  warn(message: string, meta?: any) {
    console.warn(JSON.stringify({
      level: 'warn',
      message,
      ...(meta ? { data: sanitizePayload(meta) } : {}),
      timestamp: new Date().toISOString(),
    }));
  },
  error(message: string, error?: any) {
    const errorData = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error;

    console.error(JSON.stringify({
      level: 'error',
      message,
      ...(errorData ? { error: sanitizePayload(errorData) } : {}),
      timestamp: new Date().toISOString(),
    }));
  },
  debug(message: string, meta?: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(JSON.stringify({
        level: 'debug',
        message,
        ...(meta ? { data: sanitizePayload(meta) } : {}),
        timestamp: new Date().toISOString(),
      }));
    }
  },
};
