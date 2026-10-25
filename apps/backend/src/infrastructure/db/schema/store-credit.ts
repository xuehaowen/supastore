import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customers } from "./customers";
import { orders } from "./orders";
import { refundAuthorizations } from "./refunds-payouts";
export const storeCreditAccounts = pgTable(
  "store_credit_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    currency: text("currency").notNull(),
    precision: integer("precision").notNull(),
    balanceCents: integer("balance_cents").notNull().default(0),
    reservedCents: integer("reserved_cents").notNull().default(0),
    revision: integer("revision").notNull().default(1),
  },
  (t) => [
    uniqueIndex("uq_credit_customer_currency").on(t.customerId, t.currency),
    check(
      "credit_balance_valid",
      sql`${t.balanceCents} >= ${t.reservedCents} and ${t.reservedCents} >= 0`,
    ),
  ],
);
export const storeCreditEntries = pgTable(
  "store_credit_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => storeCreditAccounts.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    kind: text("kind", {
      enum: ["issue", "debit", "refund", "reversal"],
    }).notNull(),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    reversalOfId: uuid("reversal_of_id").unique(),
    reason: text("reason").notNull(),
    actorId: text("actor_id").notNull(),
    requestKey: text("request_key").notNull().unique(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_credit_entry_history").on(t.accountId, t.createdAt, t.id),
    check("credit_entry_nonzero", sql`${t.amountCents} <> 0`),
  ],
);
export const storeCreditReservations = pgTable(
  "store_credit_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "restrict" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => storeCreditAccounts.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    status: text("status", { enum: ["active", "captured", "released"] })
      .notNull()
      .default("active"),
    debitEntryId: uuid("debit_entry_id")
      .unique()
      .references(() => storeCreditEntries.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [check("credit_hold_positive", sql`${t.amountCents} > 0`)],
);
export const storeCreditRefundSettlements = pgTable(
  "store_credit_refund_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    refundAuthorizationId: uuid("refund_authorization_id")
      .notNull()
      .unique()
      .references(() => refundAuthorizations.id, { onDelete: "restrict" }),
    creditEntryId: uuid("credit_entry_id")
      .notNull()
      .unique()
      .references(() => storeCreditEntries.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [check("credit_refund_positive", sql`${t.amountCents} > 0`)],
);
