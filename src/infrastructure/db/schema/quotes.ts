import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { carts } from "./carts";

export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  cartId: uuid("cart_id")
    .notNull()
    .references(() => carts.id, { onDelete: "restrict" }),
  cartRevision: integer("cart_revision").notNull(),
  termsSnapshot: jsonb("terms_snapshot").notNull().default({}),
  merchandiseSubtotalCents: integer("merchandise_subtotal_cents").notNull(),
  shippingCents: integer("shipping_cents").notNull(),
  exclusiveTaxCents: integer("exclusive_tax_cents").notNull(),
  inclusiveTaxCents: integer("inclusive_tax_cents").notNull(),
  totalPayableCents: integer("total_payable_cents").notNull(),
  itemsSnapshot: jsonb("items_snapshot").notNull(),
  shippingSnapshot: jsonb("shipping_snapshot").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), // 15-minute TTL
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
