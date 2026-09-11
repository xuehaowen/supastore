import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNextRetryInfo, processOutboxBatch } from '@/infrastructure/worker/outbox';
import type { NotificationAdapter } from '@/infrastructure/notifications/adapter';

describe('Outbox Worker Unit Tests', () => {
  it('respects DISABLE_OUTBOUND_DELIVERY flag', async () => {
    process.env.DISABLE_OUTBOUND_DELIVERY = 'true';
    try {
      const mockAdapter: NotificationAdapter = {
        sendEmail: vi.fn(),
      };
      const result = await processOutboxBatch({ adapter: mockAdapter });
      expect(result).toBe(0);
      expect(mockAdapter.sendEmail).not.toHaveBeenCalled();
    } finally {
      delete process.env.DISABLE_OUTBOUND_DELIVERY;
    }
  });

  it('determines exhaustion accurately after 5 retries (6 total attempts)', () => {
    // attempts = 0 (before 1st failure) -> next is retry 1
    expect(getNextRetryInfo(0).status).toBe('retrying');
    // attempts = 4 (before 5th failure) -> next is retry 5
    expect(getNextRetryInfo(4).status).toBe('retrying');
    // attempts = 5 (before 6th failure) -> next is exhausted
    expect(getNextRetryInfo(5).status).toBe('exhausted');
    expect(getNextRetryInfo(5).attempts).toBe(6);
  });
});
