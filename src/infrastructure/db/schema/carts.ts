import { pgTable, text, integer, timestamp, uuid } from 'drizzle-orm/pg-core';
import { productVariants } from './catalog';

export const carts = pgTable('carts', {
  id: uuid('id').primaryKey().defaultRandom(),
  guestSessionId: text('guest_session_id').notNull(),
  revision: integer('revision').notNull().default(1),
  convertedOrderId: uuid('converted_order_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const cartItems = pgTable('cart_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  cartId: uuid('cart_id').notNull().references(() => carts.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').notNull().references(() => productVariants.id, { onDelete: 'restrict' }),
  quantity: integer('quantity').notNull(), // CHECK (quantity > 0)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
