import { pgTable, uuid, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { orders } from './orders';

export const orderProposals = pgTable('order_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  baseRevision: integer('base_revision').notNull(),
  previousTotalCents: integer('previous_total_cents').notNull(),
  proposedTotalCents: integer('proposed_total_cents').notNull(),
  reason: text('reason').notNull(), actorId: text('actor_id').notNull(),
  status: text('status', { enum: ['pending', 'accepted', 'voided'] }).notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});
