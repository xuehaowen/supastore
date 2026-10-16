import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  uuid,
  index,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { notificationTemplateVersions } from "./notification-templates";

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  sequence: integer("sequence").notNull().default(1),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const eventDeliveries = pgTable(
  "event_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => outboxEvents.id, { onDelete: "cascade" }),
    recipient: text("recipient").notNull(),
    channel: text("channel", { enum: ["email", "webhook", "sms"] })
      .notNull()
      .default("email"),
    status: text("status", {
      enum: [
        "pending",
        "retrying",
        "delivered",
        "exhausted",
        "dispatching",
        "awaiting",
        "review",
        "suppressed",
        "accepted",
        "sent",
        "failed",
      ],
    })
      .notNull()
      .default("pending"),
    leaseToken: text("lease_token"),
    providerMessageId: text("provider_message_id"),
    providerStatus: text("provider_status"),
    failureCode: text("failure_code"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    providerName: text("provider_name"),
    providerProfile: text("provider_profile"),
    deliveryTracking: boolean("delivery_tracking").notNull().default(false),
    idempotencyWindowMs: integer("idempotency_window_ms"),
    firstSubmittedAt: timestamp("first_submitted_at", { withTimezone: true }),
    preparedMessage: jsonb("prepared_message").$type<
      | import("@/application/ports/notifications").EmailMessage
      | import("@/application/ports/notifications").SmsMessage
      | null
    >(),
    audience: text("audience", { enum: ["customer", "staff"] })
      .notNull()
      .default("customer"),
    templateVersionId: uuid("template_version_id").references(
      () => notificationTemplateVersions.id,
      { onDelete: "restrict" },
    ),
    lastAttemptId: uuid("last_attempt_id"),
    providerEventAt: timestamp("provider_event_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    retryAfter: timestamp("retry_after", { withTimezone: true })
      .defaultNow()
      .notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_event_deliveries_polling").on(table.status, table.retryAfter),
    uniqueIndex("uq_notification_provider_message").on(
      table.providerName,
      table.providerProfile,
      table.providerMessageId,
    ),
  ],
);
