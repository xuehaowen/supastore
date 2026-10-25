import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
export const catalogMediaUploads = pgTable("catalog_media_uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId: uuid("entity_id").notNull(),
  entityType: text("entity_type", {
    enum: ["product", "collection"],
  }).notNull(),
  actorId: text("actor_id").notNull(),
  s3Key: text("s3_key").notNull().unique(),
  status: text("status", {
    enum: ["pending", "attached", "expired", "deleted"],
  })
    .notNull()
    .default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
