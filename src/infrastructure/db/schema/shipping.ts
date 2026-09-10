import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// shipping_zones — destination-based flat rate rules
// ---------------------------------------------------------------------------
export const shippingZones = pgTable('shipping_zones', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // JSON array of ISO-3166-1 alpha-2 country codes this zone covers.
  // Null means the zone is a catch-all (matches any destination).
  countryCodes: jsonb('country_codes').$type<string[] | null>(),
  rateCents: integer('rate_cents').notNull(), // CHECK (rate_cents >= 0)
  // Free shipping when order subtotal >= this value. Null = no free threshold.
  freeThresholdCents: integer('free_threshold_cents'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// pickup_location — single physical location with a weekly schedule
// ---------------------------------------------------------------------------
export const pickupLocation = pgTable('pickup_location', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  // Weekly schedule stored as a JSON object, e.g.:
  // { "mon": [["09:00","18:00"]], "sat": [["10:00","14:00"]] }
  weeklySchedule: jsonb('weekly_schedule').$type<Record<string, [string, string][]>>().notNull(),
  // ISO date strings that are blackouts (store closed / no pickup).
  blackoutDates: jsonb('blackout_dates').$type<string[]>().notNull().default([]),
  // Minimum preparation time in minutes customers must allow before pickup.
  prepMinutes: integer('prep_minutes').notNull().default(60),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// pickup_time_slots — validated customer-selected pickup slot snapshot
// stored on the order/quote so historical records are not affected by
// schedule changes.
// ---------------------------------------------------------------------------
export const pickupTimeSlots = pgTable(
  'pickup_time_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: uuid('location_id').notNull().references(() => pickupLocation.id, { onDelete: 'restrict' }),
    // ISO-8601 local date string the customer selected, e.g. "2026-09-15"
    date: text('date').notNull(),
    // HH:MM start/end times from the schedule at selection time
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uq_pickup_slot').on(t.locationId, t.date, t.startTime),
  ],
);
