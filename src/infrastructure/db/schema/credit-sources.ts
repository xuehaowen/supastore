import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  storeCreditAccounts,
  storeCreditEntries,
  storeCreditReservations,
} from "./store-credit";
import { orders } from "./orders";
export const creditSourceLots = pgTable(
  "credit_source_lots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => storeCreditAccounts.id, { onDelete: "restrict" }),
    sourceEntryId: uuid("source_entry_id")
      .unique()
      .references(() => storeCreditEntries.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: ["reward", "merchant", "legacy"] }).notNull(),
    rewardOrderId: uuid("reward_order_id")
      .unique()
      .references(() => orders.id, { onDelete: "restrict" }),
    remainingCents: integer("remaining_cents").notNull(),
    reservedCents: integer("reserved_cents").notNull().default(0),
    revokedPendingCents: integer("revoked_pending_cents").notNull().default(0),
    debtCents: integer("debt_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "credit_lot_balance",
      sql`${t.remainingCents} >= ${t.reservedCents} and ${t.reservedCents} >= 0 and ${t.debtCents} >= 0 and ${t.revokedPendingCents} >= 0`,
    ),
  ],
);
export const creditSourceAllocations = pgTable(
  "credit_source_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => storeCreditReservations.id, { onDelete: "restrict" }),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => creditSourceLots.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    refundedCents: integer("refunded_cents").notNull().default(0),
  },
  (t) => [
    uniqueIndex("uq_credit_hold_source").on(t.reservationId, t.lotId),
    check(
      "credit_source_amount",
      sql`${t.amountCents} > 0 and ${t.refundedCents} >= 0 and ${t.refundedCents} <= ${t.amountCents}`,
    ),
  ],
);
export const rewardReconciliations = pgTable("reward_reconciliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }),
  requestKey: text("request_key").notNull().unique(),
  targetCents: integer("target_cents").notNull(),
  reversedCents: integer("reversed_cents").notNull(),
  restoredCents: integer("restored_cents").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const rewardFundingReviews = pgTable("reward_funding_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }),
  requestKey: uuid("request_key").notNull().unique(),
  actorId: text("actor_id").notNull(),
  reason: text("reason").notNull(),
  payloadHash: text("payload_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
