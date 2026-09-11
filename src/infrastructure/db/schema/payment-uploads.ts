import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { orders } from './orders';

// ---------------------------------------------------------------------------
// payment_upload_intents — tracks presigned S3 upload lifecycle for
// customer payment evidence files. One intent per upload attempt.
//
// Lifecycle:
//   pending  → customer has a presigned PUT URL but has not completed upload
//   staged   → S3 PUT completed; magic-byte validation not yet run
//   finalized → validation passed; evidence is associated with the order
//   expired  → TTL elapsed before staging; orphaned S3 key cleaned up by worker
// ---------------------------------------------------------------------------
export const paymentUploadIntents = pgTable(
  'payment_upload_intents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
    s3Key: text('s3_key').notNull().unique(),
    finalKey: text('final_key').unique(),
    status: text('status', {
      enum: ['pending', 'staged', 'finalized', 'expired'],
    }).notNull().default('pending'),
    // MIME type declared by the client at intent creation time.
    // Server validates the actual bytes against this on finalization.
    declaredMimeType: text('declared_mime_type').notNull(),
    // File size in bytes declared by client; used for upload URL sizing.
    declaredSizeBytes: integer('declared_size_bytes').notNull(),
    // Rate-limiting: IP / session that created the intent
    createdByIp: text('created_by_ip'),
    // Intent expiry — after this time the S3 key is eligible for cleanup
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Populated when the upload is finalized (actual MIME from magic bytes)
    verifiedMimeType: text('verified_mime_type'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Fast lookup of pending intents by order (for tracking page and cleanup)
    index('idx_upload_intents_order_status').on(t.orderId, t.status),
    // Cleanup worker polls for expired pending intents
    index('idx_upload_intents_expires_at').on(t.expiresAt),
  ],
);

export const uploadCandidates = pgTable('upload_candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  intentId: uuid('intent_id').notNull().references(() => paymentUploadIntents.id),
  key: text('key').notNull().unique(),
  status: text('status', { enum: ['active', 'retired', 'attached'] }).notNull().default('active'),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }).notNull(),
});
