import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";

/**
 * Shared Lock Ordering Manager for PostgreSQL Transactions.
 * Acquires the listed financial locks in the shared order. Callers acquiring
 * direct locks must follow the same ranks; this helper cannot police them.
 *
 * Ordering:
 * 1. Store settings / ordering gate
 * 2. Carts (sorted by UUID)
 * 3. Orders (sorted by UUID)
 * 4. Correction cases / upload intents (sorted by type, UUID)
 * 5. Fulfillment slots, then stock variants (sorted by UUID)
 * 6. Customer credit accounts and their source lots/debt
 * 7. Payment accounts, then receipts (sorted by UUID)
 * 8. Refund/return allocations and payout attempts (sorted by UUID)
 */

export interface LockTargets {
  lockStoreSettings?: boolean;
  cartIds?: string[];
  orderIds?: string[];
  stockVariantIds?: string[];
  fulfillmentSlotIds?: string[];
  creditAccountIds?: string[];
  paymentAccountIds?: string[];
  receiptIds?: string[];
  allocationIds?: string[];
  payoutAttemptIds?: string[];
}

export function sortUniqueUuids(ids?: string[]): string[] {
  if (!ids || ids.length === 0) return [];
  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
}

export async function acquireTransactionLocks(
  tx: PgTransaction<any, any, any>,
  targets: LockTargets,
): Promise<void> {
  // 1. Store settings / gate
  if (targets.lockStoreSettings) {
    await tx.execute(sql`SELECT id FROM store_settings FOR UPDATE`);
  }

  // 2. Source carts (ordered by UUID)
  const cartIds = sortUniqueUuids(targets.cartIds);
  for (const id of cartIds) {
    await tx.execute(sql`SELECT id FROM carts WHERE id = ${id} FOR UPDATE`);
  }

  // 3. Orders (ordered by UUID)
  const orderIds = sortUniqueUuids(targets.orderIds);
  for (const id of orderIds) {
    await tx.execute(sql`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`);
  }

  for (const id of sortUniqueUuids(targets.fulfillmentSlotIds)) {
    await tx.execute(sql`SELECT id FROM fulfillment_slots WHERE id = ${id} FOR UPDATE`);
  }
  // 5. Stock variants
  for (const id of sortUniqueUuids(targets.stockVariantIds)) {
    await tx.execute(
      sql`SELECT id FROM product_variants WHERE id = ${id} FOR UPDATE`,
    );
    await tx.execute(
      sql`SELECT variant_id FROM variant_stock WHERE variant_id = ${id} FOR UPDATE`,
    );
  }
  for (const id of sortUniqueUuids(targets.creditAccountIds)) {
    await tx.execute(sql`SELECT id FROM store_credit_accounts WHERE id = ${id} FOR UPDATE`);
  }
  // 7. Payment accounts then receipts
  const paymentAccountIds = sortUniqueUuids(targets.paymentAccountIds);
  for (const id of paymentAccountIds) {
    await tx.execute(
      sql`SELECT id FROM payment_accounts WHERE id = ${id} FOR UPDATE`,
    );
  }

  const receiptIds = sortUniqueUuids(targets.receiptIds);
  for (const id of receiptIds) {
    await tx.execute(
      sql`SELECT id FROM payment_receipts WHERE id = ${id} FOR UPDATE`,
    );
  }

  // 6. Allocations & payout attempts
  const allocationIds = sortUniqueUuids(targets.allocationIds);
  for (const id of allocationIds) {
    await tx.execute(
      sql`SELECT id FROM payout_allocations WHERE id = ${id} FOR UPDATE`,
    );
  }

  const payoutAttemptIds = sortUniqueUuids(targets.payoutAttemptIds);
  for (const id of payoutAttemptIds) {
    await tx.execute(
      sql`SELECT id FROM payout_attempts WHERE id = ${id} FOR UPDATE`,
    );
  }
}
