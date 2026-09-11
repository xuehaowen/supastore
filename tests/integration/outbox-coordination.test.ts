import { describe, it, expect, vi, beforeAll } from 'vitest';
import { db, queryClient } from '@/infrastructure/db';
import { outboxEvents, eventDeliveries } from '@/infrastructure/db/schema';
import { processOutboxBatch } from '@/infrastructure/worker/outbox';
import type { NotificationAdapter } from '@/infrastructure/notifications/adapter';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';

const enabled = !!process.env.DATABASE_URL?.includes('supastore');

describe.skipIf(!enabled)('Multi-Replica Worker Lease Coordination', () => {
  beforeAll(async () => {
    // Ensure clean deliveries table
    await queryClient.unsafe('TRUNCATE outbox_events, event_deliveries CASCADE');
  });

  it('coordinates claims across concurrent replicas with zero duplicate claims', async () => {
    // 1. Seed 6 events & deliveries
    const eventIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const eventId = crypto.randomUUID();
      eventIds.push(eventId);
      await db.insert(outboxEvents).values({
        id: eventId,
        eventType: 'order.submitted',
        aggregateType: 'order',
        aggregateId: crypto.randomUUID(),
        sequence: i + 1,
        payload: { test: true, idx: i },
      });

      await db.insert(eventDeliveries).values({
        id: crypto.randomUUID(),
        eventId,
        recipient: `user${i}@example.test`,
        channel: 'email',
        status: 'pending',
        attempts: 0,
        retryAfter: new Date(),
      });
    }

    const processedByA: string[] = [];
    const processedByB: string[] = [];

    const mockAdapterA: NotificationAdapter = {
      sendEmail: async ({ recipient }) => {
        processedByA.push(recipient);
        return { success: true };
      },
    };

    const mockAdapterB: NotificationAdapter = {
      sendEmail: async ({ recipient }) => {
        processedByB.push(recipient);
        return { success: true };
      },
    };

    // Run 2 workers concurrently with batchSize 5
    const [countA, countB] = await Promise.all([
      processOutboxBatch({ batchSize: 5, adapter: mockAdapterA }),
      processOutboxBatch({ batchSize: 5, adapter: mockAdapterB }),
    ]);

    expect(countA + countB).toBe(6);

    // Verify disjoint recipient processing
    const intersection = processedByA.filter((r) => processedByB.includes(r));
    expect(intersection).toEqual([]);

    // Verify all 6 marked delivered in DB
    const deliveries = await db.select().from(eventDeliveries);
    const deliveredCount = deliveries.filter((d) => d.status === 'delivered').length;
    expect(deliveredCount).toBe(6);
  });

  it('recovers expired leases when a replica stops before completing delivery', async () => {
    const eventId = crypto.randomUUID();
    const deliveryId = crypto.randomUUID();

    await db.insert(outboxEvents).values({
      id: eventId,
      eventType: 'order.confirmed',
      aggregateType: 'order',
      aggregateId: crypto.randomUUID(),
      sequence: 1,
      payload: { recovery: true },
    });

    // Insert a delivery that was claimed by a dead worker with an expired lease
    await db.insert(eventDeliveries).values({
      id: deliveryId,
      eventId,
      recipient: 'abandoned@example.test',
      channel: 'email',
      status: 'pending',
      attempts: 0,
      leaseToken: 'dead-worker-lease-token',
      leaseExpiresAt: new Date(Date.now() - 10_000), // Expired 10s ago
      retryAfter: new Date(Date.now() - 5000),
    });

    const received: string[] = [];
    const mockAdapter: NotificationAdapter = {
      sendEmail: async ({ recipient }) => {
        received.push(recipient);
        return { success: true };
      },
    };

    // New active worker polls
    const processed = await processOutboxBatch({ batchSize: 10, adapter: mockAdapter });
    expect(processed).toBe(1);
    expect(received).toContain('abandoned@example.test');

    const [updated] = await db
      .select()
      .from(eventDeliveries)
      .where(eq(eventDeliveries.id, deliveryId));

    expect(updated.status).toBe('delivered');
    expect(updated.leaseToken).toBeNull();
  });

  it('suppresses outbound deliveries when DISABLE_OUTBOUND_DELIVERY is set', async () => {
    process.env.DISABLE_OUTBOUND_DELIVERY = 'true';

    try {
      const eventId = crypto.randomUUID();
      await db.insert(outboxEvents).values({
        id: eventId,
        eventType: 'order.refunded',
        aggregateType: 'order',
        aggregateId: crypto.randomUUID(),
        sequence: 1,
        payload: { suppressed: true },
      });

      await db.insert(eventDeliveries).values({
        id: crypto.randomUUID(),
        eventId,
        recipient: 'suppressed@example.test',
        channel: 'email',
        status: 'pending',
        attempts: 0,
        retryAfter: new Date(),
      });

      const adapterCalled = vi.fn();
      const mockAdapter: NotificationAdapter = {
        sendEmail: async () => {
          adapterCalled();
          return { success: true };
        },
      };

      const processed = await processOutboxBatch({ adapter: mockAdapter });
      expect(processed).toBe(0);
      expect(adapterCalled).not.toHaveBeenCalled();
    } finally {
      delete process.env.DISABLE_OUTBOUND_DELIVERY;
    }
  });
});
