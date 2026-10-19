import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { customers } from "./customers";
export const smsPreferences = pgTable("sms_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .unique()
    .references(() => customers.id),
  phone: text("phone").notNull(),
  locale: text("locale").notNull().default("en"),
  timezone: text("timezone").notNull().default("UTC"),
  optedIn: boolean("opted_in").notNull().default(false),
  verificationSid: text("verification_sid"),
  verificationProvider: text("verification_provider"),
  verificationProfile: text("verification_profile"),
  requestNonce: uuid("request_nonce"),
  requestWindowAt: timestamp("request_window_at", { withTimezone: true }),
  requestWindowCount: integer("request_window_count").notNull().default(0),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  requestedAt: timestamp("requested_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  consentText: text("consent_text").notNull().default(""),
  consentVersion: text("consent_version").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const smsConsentEvents = pgTable(
  "sms_consent_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    preferenceId: uuid("preference_id")
      .notNull()
      .references(() => smsPreferences.id),
    phone: text("phone").notNull(),
    action: text("action", {
      enum: ["requested", "verified", "withdrawn"],
    }).notNull(),
    source: text("source").notNull(),
    wording: text("wording").notNull(),
    version: text("version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("sms_consent_phone_time").on(table.phone, table.createdAt)],
);
