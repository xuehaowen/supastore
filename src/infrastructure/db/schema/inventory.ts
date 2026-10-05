import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { productVariants } from "./catalog";
import { orders, orderItems } from "./orders";
export const variantStock = pgTable(
  "variant_stock",
  {
    variantId: uuid("variant_id")
      .primaryKey()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    trackingEnabled: boolean("tracking_enabled").notNull().default(false),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    revision: integer("revision").notNull().default(1),
  },
  (t) => [
    check("stock_nonnegative", sql`${t.onHand} >= 0 and ${t.reserved} >= 0`),
  ],
);
export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .unique()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    status: text("status", { enum: ["active", "consumed", "released"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_stock_reservation_order").on(t.orderId),
    check("stock_reservation_positive", sql`${t.quantity} > 0`),
  ],
);
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    actorId: text("actor_id").notNull(),
    requestKey: text("request_key").notNull(),
    payload: jsonb("payload").$type<{ onHand: number; tracking: boolean }>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_stock_movement_request").on(t.variantId, t.requestKey),
    index("idx_stock_movement_history").on(t.variantId, t.createdAt, t.id),
  ],
);
