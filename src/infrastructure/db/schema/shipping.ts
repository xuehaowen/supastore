import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  jsonb,
  uniqueIndex,
  boolean,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { productVariants } from "./catalog";
import { orders } from "./orders";

// ---------------------------------------------------------------------------
// shipping_zones — destination-based flat rate rules
// ---------------------------------------------------------------------------
export const shippingZones = pgTable("shipping_zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // JSON array of ISO-3166-1 alpha-2 country codes this zone covers.
  // Null means the zone is a catch-all (matches any destination).
  countryCodes: jsonb("country_codes").$type<string[] | null>(),
  regionCodes: jsonb("region_codes").$type<string[]>().notNull().default([]),
  postalPrefixes: jsonb("postal_prefixes")
    .$type<string[]>()
    .notNull()
    .default([]),
  rateCents: integer("rate_cents").notNull(), // CHECK (rate_cents >= 0)
  // Free shipping when order subtotal >= this value. Null = no free threshold.
  freeThresholdCents: integer("free_threshold_cents"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const deliveryAreas = pgTable(
  "delivery_areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    countryCodes: jsonb("country_codes").$type<string[]>().notNull(),
    postalPrefixes: jsonb("postal_prefixes").$type<string[]>().notNull(),
    rateCents: integer("rate_cents").notNull(),
    freeThresholdCents: integer("free_threshold_cents"),
    isActive: boolean("is_active").notNull().default(true),
    weeklySchedule: jsonb("weekly_schedule")
      .$type<Record<string, [string, string][]>>()
      .notNull()
      .default({}),
    prepMinutes: integer("prep_minutes").notNull().default(0),
    scheduleRequired: boolean("schedule_required").notNull().default(false),
    slotCapacity: integer("slot_capacity"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "delivery_rates",
      sql`${t.rateCents} >= 0 and (${t.freeThresholdCents} is null or ${t.freeThresholdCents} >= 0)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// pickup_location — physical locations, each with its own weekly schedule
// ---------------------------------------------------------------------------
export const pickupLocation = pgTable("pickup_location", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  // Weekly schedule stored as a JSON object, e.g.:
  // { "mon": [["09:00","18:00"]], "sat": [["10:00","14:00"]] }
  weeklySchedule: jsonb("weekly_schedule")
    .$type<Record<string, [string, string][]>>()
    .notNull(),
  // ISO date strings that are blackouts (store closed / no pickup).
  blackoutDates: jsonb("blackout_dates")
    .$type<string[]>()
    .notNull()
    .default([]),
  // Minimum preparation time in minutes customers must allow before pickup.
  prepMinutes: integer("prep_minutes").notNull().default(60),
  slotCapacity: integer("slot_capacity"),
  scheduleRequired: boolean("schedule_required").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ---------------------------------------------------------------------------
// pickup_time_slots — validated customer-selected pickup slot snapshot
// stored on the order/quote so historical records are not affected by
// schedule changes.
// ---------------------------------------------------------------------------
export const pickupTimeSlots = pgTable(
  "pickup_time_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => pickupLocation.id, { onDelete: "restrict" }),
    // ISO-8601 local date string the customer selected, e.g. "2026-09-15"
    date: text("date").notNull(),
    // HH:MM start/end times from the schedule at selection time
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("uq_pickup_slot").on(
      t.locationId,
      t.date,
      t.startTime,
      t.endTime,
    ),
  ],
);

export const fulfillmentSlots = pgTable(
  "fulfillment_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pickupSlotId: uuid("pickup_slot_id")
      .unique()
      .references(() => pickupTimeSlots.id, { onDelete: "restrict" }),
    deliveryAreaId: uuid("delivery_area_id").references(
      () => deliveryAreas.id,
      { onDelete: "restrict" },
    ),
    date: text("date").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    timezone: text("timezone").notNull(),
    capacity: integer("capacity"),
  },
  (t) => [
    uniqueIndex("uq_delivery_slot").on(
      t.deliveryAreaId,
      t.date,
      t.startTime,
      t.endTime,
    ),
    check(
      "slot_method",
      sql`(${t.pickupSlotId} is not null) <> (${t.deliveryAreaId} is not null)`,
    ),
    check(
      "slot_capacity_nonnegative",
      sql`${t.capacity} is null or ${t.capacity} >= 0`,
    ),
  ],
);
export const slotVariantQuotas = pgTable(
  "slot_variant_quotas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => fulfillmentSlots.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    uniqueIndex("uq_slot_variant_quota").on(t.slotId, t.variantId),
    check("quota_nonnegative", sql`${t.quantity} >= 0`),
  ],
);
export const slotReservations = pgTable("slot_reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  slotId: uuid("slot_id")
    .notNull()
    .references(() => fulfillmentSlots.id, { onDelete: "restrict" }),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "restrict" }),
  status: text("status", { enum: ["active", "consumed", "released"] })
    .notNull()
    .default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
