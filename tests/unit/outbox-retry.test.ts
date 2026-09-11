import { describe, it, expect } from 'vitest';
import {
  getNextRetryInfo,
  MAX_DELIVERY_ATTEMPTS,
  RETRY_DELAYS_MS,
} from '@/infrastructure/worker/outbox';

describe('Outbox Retry Schedule', () => {
  const baseTime = 1700000000000;

  it('defines 5 retry delays matching 1m, 5m, 15m, 1h, 6h', () => {
    expect(RETRY_DELAYS_MS).toEqual([
      60_000,      // 1 min
      300_000,     // 5 min
      900_000,     // 15 min
      3_600_000,   // 1 hr
      21_600_000,  // 6 hr
    ]);
    expect(MAX_DELIVERY_ATTEMPTS).toBe(6);
  });

  it('calculates 1m delay after first failed attempt (attempts = 0 -> 1)', () => {
    const info = getNextRetryInfo(0, baseTime);
    expect(info.status).toBe('retrying');
    expect(info.attempts).toBe(1);
    expect(info.retryAfter.getTime()).toBe(baseTime + 60_000);
  });

  it('calculates 5m delay after second failed attempt (attempts = 1 -> 2)', () => {
    const info = getNextRetryInfo(1, baseTime);
    expect(info.status).toBe('retrying');
    expect(info.attempts).toBe(2);
    expect(info.retryAfter.getTime()).toBe(baseTime + 300_000);
  });

  it('calculates 15m delay after third failed attempt (attempts = 2 -> 3)', () => {
    const info = getNextRetryInfo(2, baseTime);
    expect(info.status).toBe('retrying');
    expect(info.attempts).toBe(3);
    expect(info.retryAfter.getTime()).toBe(baseTime + 900_000);
  });

  it('calculates 1h delay after fourth failed attempt (attempts = 3 -> 4)', () => {
    const info = getNextRetryInfo(3, baseTime);
    expect(info.status).toBe('retrying');
    expect(info.attempts).toBe(4);
    expect(info.retryAfter.getTime()).toBe(baseTime + 3_600_000);
  });

  it('calculates 6h delay after fifth failed attempt (attempts = 4 -> 5)', () => {
    const info = getNextRetryInfo(4, baseTime);
    expect(info.status).toBe('retrying');
    expect(info.attempts).toBe(5);
    expect(info.retryAfter.getTime()).toBe(baseTime + 21_600_000);
  });

  it('transitions to exhausted on 6th failed attempt (attempts = 5 -> 6)', () => {
    const info = getNextRetryInfo(5, baseTime);
    expect(info.status).toBe('exhausted');
    expect(info.attempts).toBe(6);
  });

  it('stays exhausted on subsequent attempts beyond max', () => {
    const info = getNextRetryInfo(6, baseTime);
    expect(info.status).toBe('exhausted');
    expect(info.attempts).toBe(7);
  });
});
