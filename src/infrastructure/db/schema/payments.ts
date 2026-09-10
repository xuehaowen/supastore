import { pgTable, text, integer, boolean, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core';
import { orders } from './orders';

export const paymentAccounts = pgTable('payment_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountIdentifier: text('account_identifier').notNull().unique(),
  accountName: text('account_name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const paymentReceipts = pgTable(
  'payment_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
    paymentAccountId: uuid('payment_account_id').notNull().references(() => paymentAccounts.id, { onDelete: 'restrict' }),
    amountCents: integer('amount_cents').notNull(), // CHECK (amount_cents > 0)
    rawReference: text('raw_reference').notNull(),
    normalizedReference: text('normalized_reference').notNull(),
    recordedByUserId: text('recorded_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_payment_receipts_account_ref').on(table.paymentAccountId, table.normalizedReference),
  ]
);

export const confirmationFunding = pgTable('confirmation_funding', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
  receiptId: uuid('receipt_id').notNull().references(() => paymentReceipts.id, { onDelete: 'restrict' }),
  fundedAmountCents: integer('funded_amount_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
