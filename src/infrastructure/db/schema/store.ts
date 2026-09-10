import { pgTable, text, integer, boolean, timestamp, uuid } from 'drizzle-orm/pg-core';

export const storeSettings = pgTable('store_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeName: text('store_name').notNull(),
  currency: text('currency').notNull().default('USD'),
  precision: integer('precision').notNull().default(2),
  defaultLocale: text('default_locale').notNull().default('en'),
  timezone: text('timezone').notNull().default('UTC'),
  isOrderingEnabled: boolean('is_ordering_enabled').notNull().default(true),
  quoteVersion: integer('quote_version').notNull().default(1),
  isBootstrapCompleted: boolean('is_bootstrap_completed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const staffMemberships = pgTable('staff_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().unique(),
  email: text('email').notNull().unique(),
  role: text('role', { enum: ['owner', 'staff'] }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
