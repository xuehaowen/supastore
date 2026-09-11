import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/infrastructure/db';
import {
  carts,
  cartItems,
  eventDeliveries,
  guestOrderSessions,
} from '@/infrastructure/db/schema';
import { cleanupUploads } from '@/application/use-cases/uploads/cleanup-uploads';

export interface HousekeepingReport {
  purgedCartsCount: number;
  expiredGuestSessionsCount: number;
  prunedDeliveriesCount: number;
  timestamp: string;
}

/**
 * Purges unconverted carts older than retentionDays (default 30 days) and cascades cart items.
 * Strictly preserves converted carts (where convertedOrderId IS NOT NULL).
 */
export async function purgeUnconvertedCarts(retentionDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // Find candidate unconverted cart IDs older than cutoff
  const staleCarts = await db
    .select({ id: carts.id })
    .from(carts)
    .where(and(isNull(carts.convertedOrderId), lt(carts.updatedAt, cutoff)));

  if (staleCarts.length === 0) return 0;

  let purgedCount = 0;
  for (const cart of staleCarts) {
    // Delete cart items first, then cart
    await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await db.delete(carts).where(eq(carts.id, cart.id));
    purgedCount++;
  }

  return purgedCount;
}

/**
 * Revokes/cleans up expired guest order tracking sessions older than retentionDays (default 30 days).
 */
export async function purgeExpiredGuestSessions(retentionDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const result = await db
    .delete(guestOrderSessions)
    .where(lt(guestOrderSessions.expiresAt, cutoff))
    .returning({ id: guestOrderSessions.id });

  return result.length;
}

/**
 * Prunes completed event delivery records older than retentionDays (default 30 days).
 * Retains actionable exhausted failures ('exhausted'), retrying events, and pending events.
 */
export async function pruneOldDeliveries(retentionDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const result = await db
    .delete(eventDeliveries)
    .where(and(eq(eventDeliveries.status, 'delivered'), lt(eventDeliveries.updatedAt, cutoff)))
    .returning({ id: eventDeliveries.id });

  return result.length;
}

/**
 * Comprehensive daily housekeeping runner executing cart purging,
 * session maintenance, delivery pruning, and orphan storage cleanup.
 */
export async function runDailyHousekeeping(): Promise<HousekeepingReport> {
  const purgedCartsCount = await purgeUnconvertedCarts(30);
  const expiredGuestSessionsCount = await purgeExpiredGuestSessions(30);
  const prunedDeliveriesCount = await pruneOldDeliveries(30);

  // Clean up expired upload intents (>24h) and orphan candidate files
  try {
    await cleanupUploads();
  } catch (err) {
    console.warn('Housekeeping: cleanupUploads encountered an error:', err);
  }

  return {
    purgedCartsCount,
    expiredGuestSessionsCount,
    prunedDeliveriesCount,
    timestamp: new Date().toISOString(),
  };
}
