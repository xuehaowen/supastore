import { LRUCache } from 'lru-cache';

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// Global LRU cache holding up to 10,000 distinct client keys
const cache = new LRUCache<string, RateLimitRecord>({
  max: 10_000,
  ttl: 60 * 60 * 1000, // 1 hour max TTL
});

/**
 * Checks in-memory LRU rate limit for a given key (e.g. IP, Route + IP, or User Identifier).
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions = { maxRequests: 20, windowMs: 60_000 }
): RateLimitResult {
  const now = Date.now();
  const record = cache.get(key);

  if (!record || now >= record.resetTime) {
    const newRecord: RateLimitRecord = {
      count: 1,
      resetTime: now + options.windowMs,
    };
    cache.set(key, newRecord);
    return {
      allowed: true,
      remaining: options.maxRequests - 1,
      resetMs: options.windowMs,
    };
  }

  if (record.count >= options.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetMs: Math.max(0, record.resetTime - now),
    };
  }

  record.count++;
  cache.set(key, record);

  return {
    allowed: true,
    remaining: options.maxRequests - record.count,
    resetMs: Math.max(0, record.resetTime - now),
  };
}

/**
 * Reset rate limit cache (primarily for tests).
 */
export function _resetRateLimitCache(): void {
  cache.clear();
}
