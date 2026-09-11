import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { orders } from "./orders";

export const paymentAccounts = pgTable("payment_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountIdentifier: text("account_identifier").notNull().unique(),
  accountName: text("account_name").notNull(),
  accountType: text("account_type", { enum: ["bank_transfer", "cash", "other"] })
    .notNull()
    .default("bank_transfer"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const paymentReceipts = pgTable(
  "payment_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    paymentAccountId: uuid("payment_account_id")
      .notNull()
      .references(() => paymentAccounts.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(), // CHECK (amount_cents > 0)
    rawReference: text("raw_reference").notNull(),
    normalizedReference: text("normalized_reference").notNull(),
    recordedByUserId: text("recorded_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("idx_payment_receipts_account_ref").on(
      table.paymentAccountId,
      table.normalizedReference
    ),
  ]
);

export const confirmationFunding = pgTable("confirmation_funding", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }),
  receiptId: uuid("receipt_id")
    .notNull()
    .references(() => paymentReceipts.id, { onDelete: "restrict" }),
  fundedAmountCents: integer("funded_amount_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const cashDrawerSessions = pgTable("cash_drawer_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  drawerName: text("drawer_name").notNull().default("Main Register"),
  openedByUserId: text("opened_by_user_id").notNull(),
  closedByUserId: text("closed_by_user_id"),
  startingBalanceCents: integer("starting_balance_cents").notNull().default(0),
  closingBalanceCents: integer("closing_balance_cents"),
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  notes: text("notes"),
});

export const cashReceiptSequences = pgTable("cash_receipt_sequences", {
  year: integer("year").primaryKey(),
  lastSequenceNumber: integer("last_sequence_number").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cashReceiptDetails = pgTable("cash_receipt_details", {
  id: uuid("id").primaryKey().defaultRandom(),
  receiptId: uuid("receipt_id")
    .notNull()
    .unique()
    .references(() => paymentReceipts.id, { onDelete: "restrict" }),
  cashDrawerSessionId: uuid("cash_drawer_session_id")
    .references(() => cashDrawerSessions.id, { onDelete: "set null" }),
  sequentialNumber: text("sequential_number").notNull().unique(), // e.g. CASH-2026-0001
  drawerName: text("drawer_name").notNull().default("Main Register"),
  payerName: text("payer_name"),
  tenderedAmountCents: integer("tendered_amount_cents").notNull(),
  changeDueCents: integer("change_due_cents").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const paymentReceiptCorrections = pgTable("payment_receipt_corrections", {
  id: uuid("id").primaryKey().defaultRandom(),
  receiptId: uuid("receipt_id")
    .notNull()
    .references(() => paymentReceipts.id, { onDelete: "restrict" }),
  deltaAmountCents: integer("delta_amount_cents").notNull(), // signed integer
  reason: text("reason").notNull(),
  investigationNotes: text("investigation_notes"),
  correctedByUserId: text("corrected_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

