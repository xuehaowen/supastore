import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orders } from "./orders";
import { paymentReceipts } from "./payments";
import { payoutAllocations, payoutAttempts } from "./refunds-payouts";
export const stripeCheckoutAttempts = pgTable(
  "stripe_checkout_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    financialRevision: integer("financial_revision").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    sessionId: text("session_id").unique(),
    paymentIntentId: text("payment_intent_id").unique(),
    checkoutUrl: text("checkout_url"),
    receiptId: uuid("receipt_id")
      .unique()
      .references(() => paymentReceipts.id, { onDelete: "restrict" }),
    status: text("status", {
      enum: ["creating", "open", "paid", "expired", "review"],
    })
      .notNull()
      .default("creating"),
    reviewReason: text("review_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [check("stripe_attempt_amount_positive", sql`${t.amountCents} > 0`)],
);
export const stripeWebhookInbox = pgTable(
  "stripe_webhook_inbox",
  {
    eventId: text("event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: ["pending", "processed", "review"] })
      .notNull()
      .default("pending"),
    reviewReason: text("review_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("stripe_inbox_pending").on(t.status, t.createdAt)],
);
export const stripeRefundIntents = pgTable(
  "stripe_refund_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    allocationId: uuid("allocation_id")
      .notNull()
      .unique()
      .references(() => payoutAllocations.id, { onDelete: "restrict" }),
    payoutAttemptId: uuid("payout_attempt_id")
      .notNull()
      .unique()
      .references(() => payoutAttempts.id, { onDelete: "restrict" }),
    paymentIntentId: text("payment_intent_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    refundId: text("refund_id").unique(),
    status: text("status", {
      enum: ["creating", "pending", "succeeded", "review"],
    })
      .notNull()
      .default("creating"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [check("stripe_refund_amount_positive", sql`${t.amountCents} > 0`)],
);
