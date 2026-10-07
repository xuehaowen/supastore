import {pgTable, uuid, text, integer, date, timestamp, uniqueIndex, check} from "drizzle-orm/pg-core";
import {sql} from "drizzle-orm";
export const outsideSalesAdjustments = pgTable("outside_sales_adjustments", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleDate: date("sale_date").notNull(),
  netCents: integer("net_cents").notNull(),
  taxCents: integer("tax_cents").notNull(),
  reason: text("reason").notNull(),
  actorId: text("actor_id").notNull(),
  requestKey: uuid("request_key").notNull().unique(),
  payloadHash: text("payload_hash").notNull(),
  createdAt: timestamp("created_at", {withTimezone: true}).notNull().defaultNow(),
}, table => [check("outside_sales_nonzero", sql`${table.netCents} <> 0 OR ${table.taxCents} <> 0`)]);
export const salesThresholdAlerts = pgTable("sales_threshold_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  fiscalStart: date("fiscal_start").notNull(),
  thresholdCents: integer("threshold_cents").notNull(),
  observedNetCents: text("observed_net_cents").notNull(),
  createdAt: timestamp("created_at", {withTimezone: true}).notNull().defaultNow(),
}, table => [uniqueIndex("uq_sales_threshold_period").on(table.fiscalStart, table.thresholdCents)]);
