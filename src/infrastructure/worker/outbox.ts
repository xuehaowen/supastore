import crypto from 'node:crypto';
import { sql, eq } from 'drizzle-orm';
import { db } from '@/infrastructure/db';
import { eventDeliveries, outboxEvents } from '@/infrastructure/db/schema';
import type { NotificationAdapter } from '@/infrastructure/notifications/adapter';
import { mockEmailAdapter } from '@/infrastructure/notifications/mock';

export interface ProcessOutboxOptions {
  batchSize?: number;
  leaseDurationMs?: number;
  adapter?: NotificationAdapter;
}

/**
 * Process a single batch of pending/retrying event deliveries using SELECT ... FOR UPDATE SKIP LOCKED.
 */
export async function processOutboxBatch(options: ProcessOutboxOptions = {}): Promise<number> {
  const batchSize = options.batchSize ?? 10;
  const leaseDurationMs = options.leaseDurationMs ?? 30_000;
  const adapter = options.adapter ?? mockEmailAdapter;
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.now() + leaseDurationMs);

  // Step 1: Claim deliveries inside short transaction using SKIP LOCKED
  const claimed = await db.transaction(async (tx) => {
    const rawClaims = await tx.execute(sql`
      SELECT d.id, d.event_id, d.recipient, d.channel, d.attempts, e.event_type, e.payload
      FROM event_deliveries d
      JOIN outbox_events e ON e.id = d.event_id
      WHERE (d.status = 'pending' OR d.status = 'retrying')
        AND d.retry_after <= NOW()
        AND (d.lease_expires_at IS NULL OR d.lease_expires_at < NOW())
      ORDER BY d.created_at ASC
      LIMIT ${batchSize}
      FOR UPDATE OF d SKIP LOCKED
    `);

    if (!rawClaims || rawClaims.length === 0) {
      return [];
    }

    const deliveryIds = rawClaims.map((r: any) => r.id);
    for (const id of deliveryIds) {
      await tx
        .update(eventDeliveries)
        .set({
          leaseToken,
          leaseExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(eventDeliveries.id, id));
    }

    return rawClaims;
  });

  if (claimed.length === 0) {
    return 0;
  }

  // Step 2: Send deliveries outside transaction
  for (const item of claimed as any[]) {
    try {
      const result = await adapter.sendEmail({
        recipient: item.recipient,
        subject: `Notification: ${item.event_type}`,
        template: item.event_type,
        data: item.payload,
      });

      if (result.success) {
        await db
          .update(eventDeliveries)
          .set({
            status: 'delivered',
            leaseToken: null,
            leaseExpiresAt: null,
            attempts: item.attempts + 1,
            updatedAt: new Date(),
          })
          .where(eq(eventDeliveries.id, item.id));
      } else {
        const nextAttempts = item.attempts + 1;
        const isExhausted = nextAttempts >= 5;
        const retryAfter = new Date(Date.now() + Math.min(60_000 * Math.pow(2, nextAttempts), 3_600_000));

        await db
          .update(eventDeliveries)
          .set({
            status: isExhausted ? 'exhausted' : 'retrying',
            leaseToken: null,
            leaseExpiresAt: null,
            attempts: nextAttempts,
            retryAfter,
            updatedAt: new Date(),
          })
          .where(eq(eventDeliveries.id, item.id));
      }
    } catch {
      const nextAttempts = item.attempts + 1;
      const isExhausted = nextAttempts >= 5;
      const retryAfter = new Date(Date.now() + Math.min(60_000 * Math.pow(2, nextAttempts), 3_600_000));

      await db
        .update(eventDeliveries)
        .set({
          status: isExhausted ? 'exhausted' : 'retrying',
          leaseToken: null,
          leaseExpiresAt: null,
          attempts: nextAttempts,
          retryAfter,
          updatedAt: new Date(),
        })
        .where(eq(eventDeliveries.id, item.id));
    }
  }

  return claimed.length;
}
