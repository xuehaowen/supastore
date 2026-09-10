import { pgTable, text, integer, jsonb, timestamp, uuid } from 'drizzle-orm/pg-core';
import { carts } from './carts';
import { quotes } from './quotes';
import { productVariants } from './catalog';

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceCartId: uuid('source_cart_id').notNull().unique().references(() => carts.id, { onDelete: 'restrict' }),
  referenceCode: text('reference_code').notNull().unique(), // SP-XXXX-XXXXC
  quoteId: uuid('quote_id').notNull().references(() => quotes.id, { onDelete: 'restrict' }),
  lifecycleStatus: text('lifecycle_status', {
    enum: ['unpaid', 'confirmed', 'completed', 'cancelled'],
  }).notNull().default('unpaid'),
  purchaseTotalCents: integer('purchase_total_cents').notNull(),
  guestEmail: text('guest_email').notNull(),
  guestName: text('guest_name').notNull(),
  shippingAddressSnapshot: jsonb('shipping_address_snapshot').notNull(),
  financialRevision: integer('financial_revision').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
  variantId: uuid('variant_id').notNull().references(() => productVariants.id, { onDelete: 'restrict' }),
  quantity: integer('quantity').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  lineTotalCents: integer('line_total_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const orderFulfillments = pgTable('order_fulfillments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().unique().references(() => orders.id, { onDelete: 'restrict' }),
  status: text('status', {
    enum: ['unfulfilled', 'fulfilled'],
  }).notNull().default('unfulfilled'),
  carrier: text('carrier'),
  trackingNumber: text('tracking_number'),
  fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
