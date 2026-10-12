import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orders, orderItems } from "./orders";
export const orderReturns = pgTable(
  "order_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    status: text("status", {
      enum: ["requested", "approved", "received", "rejected", "cancelled"],
    })
      .notNull()
      .default("requested"),
    reason: text("reason").notNull(),
    requestKey: text("request_key").notNull().unique(),
    reviewReason: text("review_reason"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_order_return_owner").on(t.orderId, t.createdAt)],
);
export const orderReturnItems = pgTable(
  "order_return_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnId: uuid("return_id")
      .notNull()
      .references(() => orderReturns.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    restockedQuantity: integer("restocked_quantity").notNull().default(0),
    damagedQuantity: integer("damaged_quantity").notNull().default(0),
  },
  (t) => [
    uniqueIndex("uq_return_order_item").on(t.returnId, t.orderItemId),
    check(
      "return_quantity_valid",
      sql`${t.quantity} > 0 and ${t.restockedQuantity} >= 0 and ${t.damagedQuantity} >= 0 and ${t.restockedQuantity} + ${t.damagedQuantity} <= ${t.quantity}`,
    ),
  ],
);
