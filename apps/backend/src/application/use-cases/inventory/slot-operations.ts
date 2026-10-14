import { DomainError } from "@/application/common/errors";
import {
  parseActionInteger,
  parseActionUuid,
} from "@/application/common/request-validation";
import type { Transaction } from "@/application/common/transaction";
import { validatePickup } from "@/domain/checkout";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { db } from "@/infrastructure/db";
import {
  auditRecords,
  deliveryAreas,
  fulfillmentSlots,
  orderItems,
  pickupLocation,
  pickupTimeSlots,
  slotReservations,
  slotVariantQuotas,
  storeSettings,
} from "@/infrastructure/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export async function slotUsage(tx: Transaction, slotId: string) {
  const [count] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(slotReservations)
    .where(
      and(
        eq(slotReservations.slotId, slotId),
        inArray(slotReservations.status, ["active", "consumed"]),
      ),
    );
  return count?.count ?? 0;
}

/** Call under the order lock, before stock/credit/payment locks. */
export async function reserveSlot(
  tx: Transaction,
  orderId: string,
  pickupSlotId: string,
  timezone: string,
) {
  const [pickup] = await tx
    .select()
    .from(pickupTimeSlots)
    .where(eq(pickupTimeSlots.id, pickupSlotId));
  if (!pickup) throw new DomainError("Pickup slot is no longer available.");
  const [location] = await tx
    .select()
    .from(pickupLocation)
    .where(eq(pickupLocation.id, pickup.locationId));
  const [slot] = await tx
    .insert(fulfillmentSlots)
    .values({
      pickupSlotId,
      date: pickup.date,
      startTime: pickup.startTime,
      endTime: pickup.endTime,
      timezone,
      capacity: location?.slotCapacity,
    })
    .onConflictDoUpdate({
      target: fulfillmentSlots.pickupSlotId,
      set: { pickupSlotId },
    })
    .returning();
  await reserveFulfillmentSlot(tx, orderId, slot!.id);
  return slot!.id;
}

export async function reserveFulfillmentSlot(
  tx: Transaction,
  orderId: string,
  slotId: string,
  replaceReservationId?: string,
) {
  const [slot] = await tx
    .select()
    .from(fulfillmentSlots)
    .where(eq(fulfillmentSlots.id, slotId))
    .for("update");
  if (!slot) throw new DomainError("Fulfillment slot is no longer available.");
  if (slot.capacity != null && (await slotUsage(tx, slotId)) >= slot.capacity)
    throw new DomainError(
      "This fulfillment slot is full. Choose another time.",
    );
  const quotas = await tx
    .select()
    .from(slotVariantQuotas)
    .where(eq(slotVariantQuotas.slotId, slotId));
  const items = await tx
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  for (const quota of quotas) {
    const requested = items
      .filter((i) => i.variantId === quota.variantId)
      .reduce((sum, i) => sum + i.quantity, 0);
    if (!requested) continue;
    const [used] = await tx
      .select({
        quantity: sql<number>`coalesce(sum(${orderItems.quantity}),0)::int`,
      })
      .from(slotReservations)
      .innerJoin(orderItems, eq(orderItems.orderId, slotReservations.orderId))
      .where(
        and(
          eq(slotReservations.slotId, slotId),
          inArray(slotReservations.status, ["active", "consumed"]),
          eq(orderItems.variantId, quota.variantId),
        ),
      );
    if ((used?.quantity ?? 0) + requested > quota.quantity)
      throw new DomainError(
        "An item has sold out for this pickup slot. Choose another time.",
      );
  }
  if (replaceReservationId)
    await tx
      .update(slotReservations)
      .set({ slotId })
      .where(
        and(
          eq(slotReservations.id, replaceReservationId),
          eq(slotReservations.status, "active"),
        ),
      );
  else await tx.insert(slotReservations).values({ slotId, orderId });
}

export async function settleSlot(
  tx: Transaction,
  orderId: string,
  status: "released" | "consumed",
) {
  const [hold] = await tx
    .select()
    .from(slotReservations)
    .where(eq(slotReservations.orderId, orderId));
  if (!hold || hold.status !== "active") return;
  await tx
    .select()
    .from(fulfillmentSlots)
    .where(eq(fulfillmentSlots.id, hold.slotId))
    .for("update");
  await tx
    .update(slotReservations)
    .set({ status })
    .where(
      and(
        eq(slotReservations.id, hold.id),
        eq(slotReservations.status, "active"),
      ),
    );
}

export async function configureSlotQuota(input: {
  staffUserId: string;
  slotId: string;
  variantId: string;
  quantity: number;
}) {
  const slotId = parseActionUuid(input.slotId, "Slot");
  const variantId = parseActionUuid(input.variantId, "Variant");
  const quantity = parseActionInteger(
    input.quantity,
    "Slot quantity",
    0,
    2147483647,
  );
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    const [slot] = await tx
      .select()
      .from(fulfillmentSlots)
      .where(eq(fulfillmentSlots.id, slotId))
      .for("update");
    if (!slot) throw new DomainError("Fulfillment slot does not exist.");
    const [used] = await tx
      .select({
        quantity: sql<number>`coalesce(sum(${orderItems.quantity}),0)::int`,
      })
      .from(slotReservations)
      .innerJoin(orderItems, eq(orderItems.orderId, slotReservations.orderId))
      .where(
        and(
          eq(slotReservations.slotId, slotId),
          eq(orderItems.variantId, variantId),
          inArray(slotReservations.status, ["active", "consumed"]),
        ),
      );
    if (quantity < (used?.quantity ?? 0))
      throw new DomainError("Quota cannot be below already booked units.");
    await tx
      .insert(slotVariantQuotas)
      .values({ slotId, variantId, quantity })
      .onConflictDoUpdate({
        target: [slotVariantQuotas.slotId, slotVariantQuotas.variantId],
        set: { quantity },
      });
    await tx.insert(auditRecords).values({
      entityType: "pickup_slot",
      entityId: slotId,
      actorId: input.staffUserId,
      action: "slot.quota_changed",
      details: { variantId, quantity },
    });
  });
}

/** Materialize scheduled windows before the first booking to set variant quotas. */
export async function configureFulfillmentSlot(input: {
  staffUserId: string;
  method: "pickup" | "local_delivery";
  locationId: string;
  date: string;
  startTime: string;
}) {
  const locationId = parseActionUuid(input.locationId, "Location");
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    const [settings] = await tx.select().from(storeSettings).for("update");
    if (!settings) throw new DomainError("Set up the store first.");
    let slot: typeof fulfillmentSlots.$inferSelect | undefined;
    if (input.method === "pickup") {
      const [location] = await tx
        .select()
        .from(pickupLocation)
        .where(eq(pickupLocation.id, locationId));
      if (!location) throw new DomainError("Pickup location is unavailable.");
      const window = validatePickup(
        location,
        input.date,
        input.startTime,
        settings.timezone,
        new Date(),
      );
      const [pickup] = await tx
        .insert(pickupTimeSlots)
        .values({ locationId, ...window })
        .onConflictDoUpdate({
          target: [
            pickupTimeSlots.locationId,
            pickupTimeSlots.date,
            pickupTimeSlots.startTime,
            pickupTimeSlots.endTime,
          ],
          set: { locationId },
        })
        .returning();
      [slot] = await tx
        .insert(fulfillmentSlots)
        .values({
          pickupSlotId: pickup!.id,
          ...window,
          timezone: settings.timezone,
          capacity: location.slotCapacity,
        })
        .onConflictDoUpdate({
          target: fulfillmentSlots.pickupSlotId,
          set: { pickupSlotId: pickup!.id },
        })
        .returning();
    } else if (input.method === "local_delivery") {
      const [area] = await tx
        .select()
        .from(deliveryAreas)
        .where(eq(deliveryAreas.id, locationId));
      if (!area?.isActive)
        throw new DomainError("Delivery area is unavailable.");
      const window = validatePickup(
        { ...area, blackoutDates: [] },
        input.date,
        input.startTime,
        settings.timezone,
        new Date(),
      );
      [slot] = await tx
        .insert(fulfillmentSlots)
        .values({
          deliveryAreaId: area.id,
          ...window,
          timezone: settings.timezone,
          capacity: area.slotCapacity,
        })
        .onConflictDoUpdate({
          target: [
            fulfillmentSlots.deliveryAreaId,
            fulfillmentSlots.date,
            fulfillmentSlots.startTime,
            fulfillmentSlots.endTime,
          ],
          set: { deliveryAreaId: area.id },
        })
        .returning();
    } else throw new DomainError("Choose a scheduled fulfillment method.");
    await tx.insert(auditRecords).values({
      entityType: "fulfillment_slot",
      entityId: slot!.id,
      actorId: input.staffUserId,
      action: "slot.configured",
      details: {
        method: input.method,
        date: input.date,
        startTime: input.startTime,
      },
    });
    return slot!.id;
  });
}
