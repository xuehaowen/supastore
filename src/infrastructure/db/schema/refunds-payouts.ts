import { pgTable, text, integer, jsonb, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orders } from './orders';
import { paymentReceipts } from './payments';

export const refundAuthorizations = pgTable('refund_authorizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
  kind: text('kind', { enum: ['purchase_refund', 'cancellation_refund'] }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  reason: text('reason').notNull(),
  authorizedByUserId: text('authorized_by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const paymentReturns = pgTable('payment_returns', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
  kind: text('kind', { enum: ['excess_return', 'late_return', 'supplemental_return'] }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const payoutAllocations = pgTable('payout_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  refundAuthorizationId: uuid('refund_authorization_id').references(() => refundAuthorizations.id, { onDelete: 'restrict' }),
  paymentReturnId: uuid('payment_return_id').references(() => paymentReturns.id, { onDelete: 'restrict' }),
  receiptId: uuid('receipt_id').notNull().references(() => paymentReceipts.id, { onDelete: 'restrict' }),
  authorizedAmountCents: integer('authorized_amount_cents').notNull(),
  settledAmountCents: integer('settled_amount_cents').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const payoutDestinationVerifications = pgTable('payout_destination_verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  receiptId: uuid('receipt_id').notNull().references(() => paymentReceipts.id, { onDelete: 'restrict' }),
  destinationRevision: integer('destination_revision').notNull().default(1),
  destinationData: jsonb('destination_data').notNull(),
  verifiedByUserId: text('verified_by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const payoutAttempts = pgTable('payout_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  allocationId: uuid('allocation_id').notNull().references(() => payoutAllocations.id, { onDelete: 'restrict' }),
  destinationVerificationId: uuid('destination_verification_id').notNull().references(() => payoutDestinationVerifications.id, { onDelete: 'restrict' }),
  claimedAmountCents: integer('claimed_amount_cents').notNull(),
  status: text('status', {
    enum: ['sending', 'reconciled', 'no_transfer', 'reconciliation_required'],
  }).notNull().default('sending'),
  claimedByUserId: text('claimed_by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const outgoingTransfers = pgTable('outgoing_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  payoutAttemptId: uuid('payout_attempt_id').notNull().references(() => payoutAttempts.id, { onDelete: 'restrict' }),
  actualAmountCents: integer('actual_amount_cents').notNull(),
  transferReference: text('transfer_reference').notNull().unique(),
  customerSettlementCents: integer('customer_settlement_cents').notNull(), // C
  erroneousDisbursementCents: integer('erroneous_disbursement_cents').notNull(), // E
  destinationDataSnapshot: jsonb('destination_data_snapshot').notNull(),
  reconciledByUserId: text('reconciled_by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const payoutDiscrepancies = pgTable('payout_discrepancies', {
  id: uuid('id').primaryKey().defaultRandom(),
  payoutAttemptId: uuid('payout_attempt_id').notNull().references(() => payoutAttempts.id, { onDelete: 'restrict' }),
  status: text('status', { enum: ['open', 'resolved'] }).notNull().default('open'),
  reason: text('reason').notNull(),
  writeOffCents: integer('write_off_cents').notNull().default(0),
  resolvedByUserId: text('resolved_by_user_id'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
