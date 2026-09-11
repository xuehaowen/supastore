import { describe, it, expect } from 'vitest';
import { purgeUnconvertedCarts, pruneOldDeliveries } from '@/infrastructure/worker/housekeeping';

describe('Housekeeping Module', () => {
  it('exports purgeUnconvertedCarts and pruneOldDeliveries functions', () => {
    expect(typeof purgeUnconvertedCarts).toBe('function');
    expect(typeof pruneOldDeliveries).toBe('function');
  });
});
