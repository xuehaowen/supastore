import {
  pgTable,
  text,
  uuid,
  timestamp,
  index,
  jsonb,
} from "drizzle-orm/pg-core";

export const scheduledActions = pgTable(
  "scheduled_actions",
  {
    key: text("key").primaryKey(),
    jobId: uuid("job_id").notNull(),
    kind: text("kind", {
      enum: [
        "pickup-reminder",
        "payment-upload",
        "catalog-upload",
        "upload-candidate",
      ],
    }).notNull(),
    entityId: uuid("entity_id").notNull(),
    slotId: uuid("slot_id"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status", { enum: ["pending", "completed", "cancelled"] })
      .notNull()
      .default("pending"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_scheduled_actions_due").on(t.status, t.scheduledFor)],
);

export const workerHeartbeats = pgTable("worker_heartbeats", {
  id: uuid("id").primaryKey(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  jobs: jsonb("jobs").notNull().default({}),
});
