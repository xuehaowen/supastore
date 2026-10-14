import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { customers } from "./customers";
export const smsPreferences = pgTable("sms_preferences", {
  customerId: uuid("customer_id")
    .primaryKey()
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
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
