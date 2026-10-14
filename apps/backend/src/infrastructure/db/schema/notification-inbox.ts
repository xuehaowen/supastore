import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { eventDeliveries } from "./outbox";
export const notificationAttempts = pgTable(
  "notification_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => eventDeliveries.id),
    leaseToken: text("lease_token").notNull(),
    requestId: uuid("request_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    provider: text("provider").notNull(),
    profile: text("profile").notNull(),
    preparedMessage: jsonb("prepared_message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_notification_attempt_number").on(
      t.deliveryId,
      t.attemptNumber,
    ),
  ],
);
export const notificationAttemptResults = pgTable(
  "notification_attempt_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => notificationAttempts.id),
    resultKey: text("result_key").notNull().unique(),
    outcome: text("outcome", {
      enum: ["accepted", "rejected", "unknown"],
    }).notNull(),
    providerMessageId: text("provider_message_id"),
    code: text("code"),
    durationMs: integer("duration_ms").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_notification_result_message").on(t.providerMessageId)],
);
export const notificationInbox = pgTable(
  "notification_inbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    profile: text("profile").notNull(),
    eventId: text("event_id").notNull(),
    payload: jsonb("payload")
      .$type<
        | import("@/application/ports/notifications").NotificationEvent
        | {
            state: "unhandled";
            provider: string;
            profile: string;
            eventId: string;
            occurredAt: Date;
          }
      >()
      .notNull(),
    payloadHash: text("payload_hash").notNull(),
    rawBody: text("raw_body"),
    status: text("status", { enum: ["pending", "applied", "unmatched"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    retryAfter: timestamp("retry_after", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_notification_inbox_event").on(
      t.provider,
      t.profile,
      t.eventId,
    ),
    index("idx_notification_inbox_pending").on(t.status, t.retryAfter),
  ],
);
