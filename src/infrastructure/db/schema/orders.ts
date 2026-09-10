import { pgTable, text, integer, jsonb, timestamp, uuid, boolean, index } from 'drizzle-orm/pg-core';
import { carts } from './carts';
import { quotes } from './quotes';
import { productVariants } from './catalog';
import { pickupTimeSlots } from './shipping';

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
  // 'shipping' | 'pickup' — determines which fulfillment fields are relevant
  fulfillmentType: text('fulfillment_type', {
    enum: ['shipping', 'pickup'],
  }).notNull().default('shipping'),
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
    enum: ['unfulfilled', 'preparing', 'ready_for_pickup', 'shipped', 'fulfilled'],
  }).notNull().default('unfulfilled'),
  // Shipping fields
  carrier: text('carrier'),
  trackingNumber: text('tracking_number'),
  // Pickup fields
  pickupSlotId: uuid('pickup_slot_id').references(() => pickupTimeSlots.id, { onDelete: 'restrict' }),
  handoffActor: text('handoff_actor'), // staff member who completed the handoff
  handoffAt: timestamp('handoff_at', { withTimezone: true }),
  fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// guest_order_sessions — scoped, bounded tokens for order tracking (C4/C8)
//
// A token is issued after order creation and stored as an HTTP-only cookie.
// Magic link recovery (C8) issues a single-use exchange token that redeems
// into a new session row.
// ---------------------------------------------------------------------------
export const guestOrderSessions = pgTable(
  'guest_order_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
    // Hashed session token stored in the __Host-supastore-order-session cookie
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Single-use recovery exchange token (null after use or if not a recovery session)
    recoveryTokenHash: text('recovery_token_hash').unique(),
    recoveryUsedAt: timestamp('recovery_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Lookup active sessions for an order
    index('idx_guest_order_sessions_order').on(t.orderId),
  ],
);

