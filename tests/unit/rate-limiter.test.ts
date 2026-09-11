import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, _resetRateLimitCache } from '@/infrastructure/security/rate-limiter';

describe('Rate Limiter', () => {
  beforeEach(() => {
    _resetRateLimitCache();
  });

  it('allows requests within limit and decrements remaining', () => {
    const key = 'test-ip-1';
    const opts = { maxRequests: 3, windowMs: 1000 };

    const res1 = checkRateLimit(key, opts);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = checkRateLimit(key, opts);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = checkRateLimit(key, opts);
    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);

    // 4th request exceeds limit
    const res4 = checkRateLimit(key, opts);
    expect(res4.allowed).toBe(false);
    expect(res4.remaining).toBe(0);
    expect(res4.resetMs).toBeGreaterThan(0);
  });

  it('tracks distinct keys independently', () => {
    const opts = { maxRequests: 2, windowMs: 1000 };

    checkRateLimit('client-a', opts);
    checkRateLimit('client-a', opts);
    const blockedA = checkRateLimit('client-a', opts);
    expect(blockedA.allowed).toBe(false);

    // client-b has separate quota
    const allowedB = checkRateLimit('client-b', opts);
    expect(allowedB.allowed).toBe(true);
  });
});
