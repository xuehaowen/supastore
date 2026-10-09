import { db } from "@/infrastructure/db";
import {
  storeSettings,
  categories,
  paymentAccounts,
  pickupLocation,
  shippingZones,
  pickupTimeSlots,
  slotReservations,
  deliveryAreas,
  fulfillmentSlots,
} from "@/infrastructure/db/schema";
import { eq, ne, and, inArray, sql, gte, lte } from "drizzle-orm";
import { apiResponse } from "@/infrastructure/http/commerce-api";
import { commercePolicy } from "@/domain/commerce-policy";
import { pickupAvailability } from "@/domain/pickup-availability";
import { stripeConfiguredFor } from "@/domain/stripe-currency";
export async function GET() {
  return apiResponse(async () => {
    const [store] = await db.select().from(storeSettings).limit(1);
    if (!store) return null;
    const [categoryRows, payments, pickup, shipping, delivery] =
      await Promise.all([
        db
          .select({
            id: categories.id,
            name: categories.name,
            slug: categories.slug,
          })
          .from(categories),
        db
          .select({
            id: paymentAccounts.id,
            name: paymentAccounts.accountName,
            type: paymentAccounts.accountType,
          })
          .from(paymentAccounts)
          .where(
            and(
              eq(paymentAccounts.isActive, true),
              ne(paymentAccounts.accountType, "stripe"),
            ),
          ),
        db.select().from(pickupLocation),
        db
          .select({
            id: shippingZones.id,
            name: shippingZones.name,
            countryCodes: shippingZones.countryCodes,
            regionCodes: shippingZones.regionCodes,
            postalPrefixes: shippingZones.postalPrefixes,
            rateCents: shippingZones.rateCents,
            freeThresholdCents: shippingZones.freeThresholdCents,
          })
          .from(shippingZones),
        db
          .select({
            id: deliveryAreas.id,
            name: deliveryAreas.name,
            countryCodes: deliveryAreas.countryCodes,
            postalPrefixes: deliveryAreas.postalPrefixes,
            rateCents: deliveryAreas.rateCents,
            freeThresholdCents: deliveryAreas.freeThresholdCents,
            weeklySchedule: deliveryAreas.weeklySchedule,
            prepMinutes: deliveryAreas.prepMinutes,
            slotCapacity: deliveryAreas.slotCapacity,
            scheduleRequired: deliveryAreas.scheduleRequired,
          })
          .from(deliveryAreas)
          .where(eq(deliveryAreas.isActive, true)),
      ]);
    const availability = await db.transaction(async (tx) => {
      const generated = pickup.map((p) => ({
        location: p,
        dates: pickupAvailability(p, store.timezone),
      }));
      const deliveryGenerated = delivery.map((p) => ({
        area: p,
        dates: p.scheduleRequired
          ? pickupAvailability({ ...p, blackoutDates: [] }, store.timezone)
          : [],
      }));
      const dates = [
        ...generated.flatMap((p) => p.dates.map((d) => d.date)),
        ...deliveryGenerated.flatMap((p) => p.dates.map((d) => d.date)),
      ].sort();
      const saved = dates.length
        ? await tx
            .select({
              locationId: pickupTimeSlots.locationId,
              deliveryAreaId: fulfillmentSlots.deliveryAreaId,
              date: fulfillmentSlots.date,
              startTime: fulfillmentSlots.startTime,
              endTime: fulfillmentSlots.endTime,
              used: sql<number>`count(${slotReservations.id})::int`,
            })
            .from(fulfillmentSlots)
            .leftJoin(
              pickupTimeSlots,
              eq(pickupTimeSlots.id, fulfillmentSlots.pickupSlotId),
            )
            .leftJoin(
              slotReservations,
              and(
                eq(slotReservations.slotId, fulfillmentSlots.id),
                inArray(slotReservations.status, ["active", "consumed"]),
              ),
            )
            .where(
              and(
                gte(fulfillmentSlots.date, dates[0]!),
                lte(fulfillmentSlots.date, dates[dates.length - 1]!),
              ),
            )
            .groupBy(fulfillmentSlots.id, pickupTimeSlots.locationId)
        : [];
      const full = new Set<string>();
      for (const slot of saved) {
        const location = slot.deliveryAreaId
          ? delivery.find((p) => p.id === slot.deliveryAreaId)
          : pickup.find((p) => p.id === slot.locationId);
        if (
          location?.slotCapacity != null &&
          slot.used >= location.slotCapacity
        )
          full.add(
            `${slot.deliveryAreaId ?? slot.locationId}/${slot.date}/${slot.startTime}/${slot.endTime}`,
          );
      }
      const pickupLocations = generated.map(({ location: p, dates }) => ({
        id: p.id,
        name: p.name,
        address: p.address,
        weeklySchedule: p.weeklySchedule,
        prepMinutes: p.prepMinutes,
        slotCapacity: p.slotCapacity,
        scheduleRequired: p.scheduleRequired,
        dates: dates
          .map((d) => ({
            ...d,
            slots: d.slots.filter(
              (s) =>
                p.slotCapacity !== 0 &&
                !full.has(`${p.id}/${d.date}/${s.startTime}/${s.endTime}`),
            ),
          }))
          .filter((d) => d.slots.length > 0),
      }));
      const deliveryAreas = deliveryGenerated.map(({ area, dates }) => ({
        ...area,
        dates: dates
          .map((d) => ({
            ...d,
            slots: d.slots.filter(
              (s) =>
                area.slotCapacity !== 0 &&
                !full.has(`${area.id}/${d.date}/${s.startTime}/${s.endTime}`),
            ),
          }))
          .filter((d) => d.slots.length > 0),
      }));
      return { pickupLocations, deliveryAreas };
    });
    return {
      storeName: store.storeName,
      logoKey: store.logoKey,
      supportEmail: store.supportEmail,
      publicContent: store.publicContent,
      currency: store.currency,
      precision: store.precision,
      defaultLocale: store.defaultLocale,
      timezone: store.timezone,
      isPaused: store.isPaused,
      pauseMessage: store.pauseMessage,
      isOrderingEnabled: store.isOrderingEnabled,
      commercePolicy: commercePolicy(store.commercePolicy),
      stripeConfigured: stripeConfiguredFor(store),
      categories: categoryRows,
      paymentMethods: payments,
      shippingZones: shipping,
      deliveryAreas: availability.deliveryAreas,
      pickupLocations: availability.pickupLocations,
    };
  }, true);
}
