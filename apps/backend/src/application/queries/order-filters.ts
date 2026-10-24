import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  orders,
  pickupLocation,
  storeSettings,
} from "@/infrastructure/db/schema";
import type { OrderFilters } from "@/domain/catalog/order-filters";

// Pickup terms are updated when fulfillment is rescheduled.
export const orderPickupLocation = sql<string>`coalesce((select ${pickupLocation.name} from ${pickupLocation} where ${pickupLocation.id}::text = ${orders.termsSnapshot}->'pickup'->>'locationId'), ${orders.termsSnapshot}->'pickup'->>'address', '')`;
export const orderPickupTime = sql<string>`coalesce(${orders.termsSnapshot}->'pickup'->>'date', '') || ' ' || coalesce(${orders.termsSnapshot}->'pickup'->>'startTime', '')`;
export const orderDecimalTotal = sql`(${orders.purchaseTotalCents}::numeric / power(10::numeric, coalesce((${orders.termsSnapshot}->>'precision')::int, (select ${storeSettings.precision} from ${storeSettings} limit 1), 2)))`;

export function orderFilterConditions(filters: OrderFilters) {
  const pickupDate = sql`${orders.termsSnapshot}->'pickup'->>'date'`;
  return and(
    filters.customer
      ? or(
          ilike(orders.guestName, `%${filters.customer}%`),
          ilike(orders.guestEmail, `%${filters.customer}%`),
        )
      : undefined,
    filters.pickupLocation
      ? and(
          eq(orders.fulfillmentType, "pickup"),
          ilike(orderPickupLocation, `%${filters.pickupLocation}%`),
        )
      : undefined,
    filters.pickupFrom
      ? sql`${pickupDate} >= ${filters.pickupFrom}`
      : undefined,
    filters.pickupTo ? sql`${pickupDate} <= ${filters.pickupTo}` : undefined,
    filters.pickupTimeFrom
      ? sql`${orders.termsSnapshot}->'pickup'->>'startTime' >= ${filters.pickupTimeFrom}`
      : undefined,
    filters.pickupTimeTo
      ? sql`${orders.termsSnapshot}->'pickup'->>'startTime' <= ${filters.pickupTimeTo}`
      : undefined,
    filters.createdFrom
      ? sql`${orders.createdAt} >= ${filters.createdFrom}::date::timestamp at time zone 'UTC'`
      : undefined,
    filters.createdTo
      ? sql`${orders.createdAt} < (${filters.createdTo}::date + interval '1 day') at time zone 'UTC'`
      : undefined,
    filters.minTotal
      ? sql`${orderDecimalTotal} >= ${filters.minTotal}::numeric`
      : undefined,
    filters.maxTotal
      ? sql`${orderDecimalTotal} <= ${filters.maxTotal}::numeric`
      : undefined,
    filters.fulfillmentType
      ? eq(
          orders.fulfillmentType,
          filters.fulfillmentType as "shipping" | "pickup" | "local_delivery",
        )
      : undefined,
  );
}

export function orderSort(filters: OrderFilters) {
  const key =
    filters.sort === "pickupLocation"
      ? orderPickupLocation
      : filters.sort === "pickupTime"
        ? orderPickupTime
        : filters.sort === "customer"
          ? orders.guestName
          : filters.sort === "total"
            ? orderDecimalTotal
            : orders.createdAt;
  const direction = filters.direction ?? "desc";
  const sort = direction === "asc" ? asc : desc;
  return {
    key,
    direction,
    clauses: [sort(key), sort(orders.id)],
    cursorValue: (value: string) =>
      filters.sort === "total"
        ? sql`${value}::numeric`
        : !filters.sort || filters.sort === "createdAt"
          ? sql`${value}::timestamptz`
          : sql`${value}::text`,
  };
}
