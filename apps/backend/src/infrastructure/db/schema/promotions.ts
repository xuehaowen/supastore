import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orders } from "./orders";

export const promotions = pgTable(
  "promotions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    discountType: text("discount_type", {
      enum: ["percentage", "fixed"],
    }).notNull(),
    discountValue: integer("discount_value").notNull(),
    minimumSubtotalCents: integer("minimum_subtotal_cents")
      .notNull()
      .default(0),
    usageLimit: integer("usage_limit"),
    maximumOriginalSubtotalCents: integer("maximum_original_subtotal_cents"),
    maximumQuantity: integer("maximum_quantity"),
    isActive: boolean("is_active").notNull().default(true),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "promotions_maximum_original_subtotal_positive",
      sql`${table.maximumOriginalSubtotalCents} IS NULL OR ${table.maximumOriginalSubtotalCents} > 0`,
    ),
    check(
      "promotions_maximum_quantity_valid",
      sql`${table.maximumQuantity} IS NULL OR ${table.maximumQuantity} BETWEEN 1 AND 99900`,
    ),
    check("promotions_value_positive", sql`${table.discountValue} > 0`),
    check(
      "promotions_minimum_nonnegative",
      sql`${table.minimumSubtotalCents} >= 0`,
    ),
    check(
      "promotions_percentage_max",
      sql`${table.discountType} <> 'percentage' OR ${table.discountValue} <= 10000`,
    ),
    check(
      "promotions_usage_limit_positive",
      sql`${table.usageLimit} IS NULL OR ${table.usageLimit} > 0`,
    ),
    index("promotions_active_window_idx").on(
      table.isActive,
      table.startsAt,
      table.endsAt,
    ),
  ],
);

export const promotionRedemptions = pgTable(
  "promotion_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    discountCents: integer("discount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("promotion_redemptions_order_unique").on(table.orderId),
    index("promotion_redemptions_promotion_idx").on(table.promotionId),
    check(
      "promotion_redemptions_discount_positive",
      sql`${table.discountCents} > 0`,
    ),
  ],
);
