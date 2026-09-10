import { pgTable, text, integer, jsonb, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: text('event_type').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  sequence: integer('sequence').notNull().default(1),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const eventDeliveries = pgTable(
  'event_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => outboxEvents.id, { onDelete: 'cascade' }),
    recipient: text('recipient').notNull(),
    channel: text('channel', { enum: ['email', 'webhook'] }).notNull().default('email'),
    status: text('status', {
      enum: ['pending', 'retrying', 'delivered', 'exhausted'],
    }).notNull().default('pending'),
    leaseToken: text('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    retryAfter: timestamp('retry_after', { withTimezone: true }).defaultNow().notNull(),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_event_deliveries_polling').on(table.status, table.retryAfter),
  ]
);
