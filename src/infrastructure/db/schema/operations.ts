import { pgTable, text, jsonb, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core';

export const operationRequests = pgTable(
  'operation_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestKey: text('request_key').notNull(),
    actorScope: text('actor_scope').notNull(),
    action: text('action').notNull(),
    inputFingerprint: text('input_fingerprint').notNull(),
    resultPayload: jsonb('result_payload'),
    status: text('status', { enum: ['processing', 'completed', 'failed'] }).notNull().default('processing'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_operation_requests_key_actor_action').on(table.requestKey, table.actorScope, table.action),
  ]
);

export const auditRecords = pgTable('audit_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  reason: text('reason').notNull().default(''),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
