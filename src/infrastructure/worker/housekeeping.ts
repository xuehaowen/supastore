import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  carts,
  cartItems,
  eventDeliveries,
  guestOrderSessions,
  quotes,
  orders,
  notificationAttempts,
} from "@/infrastructure/db/schema";
import { cleanupUploads } from "@/application/use-cases/uploads/cleanup-uploads";
import { logger } from "@/infrastructure/security/logger";
import { cleanupCatalogMedia } from "@/application/use-cases/catalog/cleanup-catalog-media";

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
export async function purgeUnconvertedCarts(
  retentionDays = 30,
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  return db.transaction(async (tx) => {
    const staleCarts = await tx
      .select({ id: carts.id })
      .from(carts)
      .where(
        and(
          isNull(carts.convertedOrderId),
          lt(carts.updatedAt, cutoff),
          sql`not exists (select 1 from ${orders} where ${orders.sourceCartId} = ${carts.id})`,
          sql`not exists (select 1 from ${quotes} where ${quotes.cartId} = ${carts.id} and ${quotes.expiresAt} > now())`,
          sql`not exists (select 1 from ${quotes} join ${orders} on ${orders.quoteId} = ${quotes.id} where ${quotes.cartId} = ${carts.id})`,
        ),
      )
      .orderBy(asc(carts.updatedAt), asc(carts.id))
      .limit(100)
      .for("update", { skipLocked: true });
    if (!staleCarts.length) return 0;
    const ids = staleCarts.map((cart) => cart.id);
    await tx.delete(quotes).where(inArray(quotes.cartId, ids));
    await tx.delete(cartItems).where(inArray(cartItems.cartId, ids));
    return (
      await tx
        .delete(carts)
        .where(inArray(carts.id, ids))
        .returning({ id: carts.id })
    ).length;
  });
}

/**
 * Revokes/cleans up expired guest order tracking sessions older than retentionDays (default 30 days).
 */
export async function purgeExpiredGuestSessions(
  retentionDays = 30,
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: guestOrderSessions.id })
      .from(guestOrderSessions)
      .where(lt(guestOrderSessions.expiresAt, cutoff))
      .orderBy(asc(guestOrderSessions.expiresAt), asc(guestOrderSessions.id))
      .limit(1000)
      .for("update", { skipLocked: true });
    if (!candidates.length) return 0;
    return (
      await tx
        .delete(guestOrderSessions)
        .where(
          inArray(
            guestOrderSessions.id,
            candidates.map((row) => row.id),
          ),
        )
        .returning({ id: guestOrderSessions.id })
    ).length;
  });
}

/**
 * Prunes completed event delivery records older than retentionDays (default 30 days).
 * Retains actionable exhausted failures ('exhausted'), retrying events, and pending events.
 */
export async function pruneOldDeliveries(retentionDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  return db.transaction(async (tx) => {
    // Immutable provider attempts/results must remain intact; their FK forbids deletion.
    const candidates = await tx
      .select({ id: eventDeliveries.id })
      .from(eventDeliveries)
      .where(
        and(
          eq(eventDeliveries.status, "delivered"),
          lt(eventDeliveries.updatedAt, cutoff),
          sql`not exists (select 1 from ${notificationAttempts} where ${notificationAttempts.deliveryId} = ${eventDeliveries.id})`,
        ),
      )
      .orderBy(asc(eventDeliveries.updatedAt), asc(eventDeliveries.id))
      .limit(1000)
      .for("update", { skipLocked: true });
    if (!candidates.length) return 0;
    return (
      await tx
        .delete(eventDeliveries)
        .where(
          inArray(
            eventDeliveries.id,
            candidates.map((row) => row.id),
          ),
        )
        .returning({ id: eventDeliveries.id })
    ).length;
  });
}

/**
 * Comprehensive daily housekeeping runner executing cart purging,
 * session maintenance, delivery pruning, and orphan storage cleanup.
 */
export async function runDailyHousekeeping(): Promise<HousekeepingReport> {
  let purgedCartsCount = 0;
  for (let batch = 0; batch < 10; batch++) {
    const count = await purgeUnconvertedCarts(30);
    purgedCartsCount += count;
    if (count < 100) break;
  }
  const expiredGuestSessionsCount = await purgeExpiredGuestSessions(30);
  const prunedDeliveriesCount = await pruneOldDeliveries(30);

  // Clean up expired upload intents (>24h) and orphan candidate files
  try {
    await cleanupUploads();
    await cleanupCatalogMedia();
  } catch (err) {
    logger.error("Housekeeping: cleanupUploads encountered an error.", err);
  }

  return {
    purgedCartsCount,
    expiredGuestSessionsCount,
    prunedDeliveriesCount,
    timestamp: new Date().toISOString(),
  };
}
