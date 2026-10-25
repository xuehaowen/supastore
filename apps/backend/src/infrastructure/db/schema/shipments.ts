import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orders, orderItems } from "./orders";
export const orderShipments = pgTable(
  "order_shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    requestKey: text("request_key").notNull(),
    carrier: text("carrier").notNull(),
    provider: text("provider").notNull().default("manual"),
    trackingNumber: text("tracking_number"),
    status: text("status", { enum: ["dispatched", "delivered"] })
      .notNull()
      .default("dispatched"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uq_shipment_request").on(t.orderId, t.requestKey)],
);
export const shipmentItems = pgTable(
  "shipment_items",
  {
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => orderShipments.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.shipmentId, t.orderItemId] }),
    check("shipment_quantity_positive", sql`${t.quantity}>0`),
  ],
);
export const carrierEvents = pgTable(
  "carrier_events",
  {
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => orderShipments.id, { onDelete: "restrict" }),
    bodyHash: text("body_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.eventId] })],
);
