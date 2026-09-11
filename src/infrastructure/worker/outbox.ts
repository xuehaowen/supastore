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
 * Bounded retry schedule: 5 retries after initial attempt (1m, 5m, 15m, 1h, 6h),
 * then terminal 'exhausted' status.
 */
export const RETRY_DELAYS_MS = [
  60_000,      // 1m (after 1st failed attempt)
  300_000,     // 5m (after 2nd failed attempt)
  900_000,     // 15m (after 3rd failed attempt)
  3_600_000,   // 1h (after 4th failed attempt)
  21_600_000,  // 6h (after 5th failed attempt)
];

export const MAX_DELIVERY_ATTEMPTS = 6; // 1 initial attempt + 5 retries

export function getNextRetryInfo(currentAttempts: number, now = Date.now()): {
  status: 'retrying' | 'exhausted';
  attempts: number;
  retryAfter: Date;
} {
  const nextAttempts = currentAttempts + 1;
  if (nextAttempts >= MAX_DELIVERY_ATTEMPTS) {
    return {
      status: 'exhausted',
      attempts: nextAttempts,
      retryAfter: new Date(now),
    };
  }

  const delayMs = RETRY_DELAYS_MS[nextAttempts - 1] ?? 21_600_000;
  return {
    status: 'retrying',
    attempts: nextAttempts,
    retryAfter: new Date(now + delayMs),
  };
}

/**
 * Process a single batch of pending/retrying event deliveries using SELECT ... FOR UPDATE SKIP LOCKED.
 */
export async function processOutboxBatch(options: ProcessOutboxOptions = {}): Promise<number> {
  // Check if outbound delivery is disabled (e.g. during disaster recovery cold restore)
  if (process.env.DISABLE_OUTBOUND_DELIVERY === 'true') {
    return 0;
  }

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
        // Only acknowledge if lease is still ours or active
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
        const retryInfo = getNextRetryInfo(item.attempts);
        await db
          .update(eventDeliveries)
          .set({
            status: retryInfo.status,
            leaseToken: null,
            leaseExpiresAt: null,
            attempts: retryInfo.attempts,
            retryAfter: retryInfo.retryAfter,
            updatedAt: new Date(),
          })
          .where(eq(eventDeliveries.id, item.id));
      }
    } catch {
      const retryInfo = getNextRetryInfo(item.attempts);
      await db
        .update(eventDeliveries)
        .set({
          status: retryInfo.status,
          leaseToken: null,
          leaseExpiresAt: null,
          attempts: retryInfo.attempts,
          retryAfter: retryInfo.retryAfter,
          updatedAt: new Date(),
        })
        .where(eq(eventDeliveries.id, item.id));
    }
  }

  return claimed.length;
}
