import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  uuid,
  boolean,
  index,
  check,
} from "drizzle-orm/pg-core";
import { carts } from "./carts";
import { quotes } from "./quotes";
import { productVariants } from "./catalog";
import { pickupTimeSlots, fulfillmentSlots } from "./shipping";
import { customers } from "./customers";
import { smsPreferences } from "./sms";
import { sql } from "drizzle-orm";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceCartId: uuid("source_cart_id")
      .notNull()
      .unique()
      .references(() => carts.id, { onDelete: "restrict" }),
    referenceCode: text("reference_code").notNull().unique(), // SP-XXXX-XXXXC
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "restrict" }),
    lifecycleStatus: text("lifecycle_status", {
      enum: ["unpaid", "confirmed", "completed", "cancelled"],
    })
      .notNull()
      .default("unpaid"),
    purchaseTotalCents: integer("purchase_total_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    creditAppliedCents: integer("credit_applied_cents").notNull().default(0),
    guestEmail: text("guest_email").notNull(),
    guestName: text("guest_name").notNull(),
    smsPreferenceId: uuid("sms_preference_id").references(
      () => smsPreferences.id,
    ),
    notificationLocale: text("notification_locale", { enum: ["en", "zh"] })
      .notNull()
      .default("en"),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "restrict",
    }),
    // 'shipping' | 'pickup' — determines which fulfillment fields are relevant
    fulfillmentType: text("fulfillment_type", {
      enum: ["shipping", "pickup", "local_delivery"],
    })
      .notNull()
      .default("shipping"),
    shippingAddressSnapshot: jsonb("shipping_address_snapshot").notNull(),
    financialRevision: integer("financial_revision").notNull().default(1),
    termsSnapshot: jsonb("terms_snapshot").notNull().default({}),
    rewardSnapshot: jsonb("reward_snapshot").$type<
      import("@/domain/rewards").RewardSnapshot | null
    >(),
    rewardFundingReview: boolean("reward_funding_review")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("idx_order_customer_history").on(t.customerId, t.createdAt, t.id),
    index("idx_order_admin_history").on(t.createdAt, t.id),
    index("idx_order_status_history").on(t.lifecycleStatus, t.createdAt, t.id),
    check(
      "order_credit_within_purchase",
      sql`${t.creditAppliedCents} >= 0 and ${t.creditAppliedCents} <= ${t.purchaseTotalCents}`,
    ),
  ],
);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }),
  variantId: uuid("variant_id")
    .notNull()
    .references(() => productVariants.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  lineTotalCents: integer("line_total_cents").notNull(),
  catalogSnapshot: jsonb("catalog_snapshot")
    .$type<{ title?: string; sku?: string; options?: Record<string, string> }>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const orderFulfillments = pgTable("order_fulfillments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "restrict" }),
  status: text("status", {
    enum: [
      "unfulfilled",
      "preparing",
      "ready_for_pickup",
      "shipped",
      "fulfilled",
    ],
  })
    .notNull()
    .default("unfulfilled"),
  // Shipping fields
  carrier: text("carrier"),
  trackingNumber: text("tracking_number"),
  // Pickup fields
  pickupSlotId: uuid("pickup_slot_id").references(() => pickupTimeSlots.id, {
    onDelete: "restrict",
  }),
  fulfillmentSlotId: uuid("fulfillment_slot_id").references(
    () => fulfillmentSlots.id,
    { onDelete: "restrict" },
  ),
  handoffActor: text("handoff_actor"), // staff member who completed the handoff
  handoffAt: timestamp("handoff_at", { withTimezone: true }),
  fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ---------------------------------------------------------------------------
// guest_order_sessions — scoped, bounded tokens for order tracking (C4/C8)
//
// A token is issued after order creation and stored as an HTTP-only cookie.
// Magic link recovery (C8) issues a single-use exchange token that redeems
// into a new session row.
// ---------------------------------------------------------------------------
export const guestOrderSessions = pgTable(
  "guest_order_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    // Hashed session token stored in the __Host-supastore-order-session cookie
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Single-use recovery exchange token (null after use or if not a recovery session)
    recoveryTokenHash: text("recovery_token_hash").unique(),
    recoveryUsedAt: timestamp("recovery_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // Lookup active sessions for an order
    index("idx_guest_order_sessions_order").on(t.orderId),
  ],
);
