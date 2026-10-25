import { schedulePickupReminder } from "@/application/scheduling/scheduled-actions";
import { DomainError } from "@/application/common/errors";
import {
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";
import { validatePickup } from "@/domain/checkout";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { db } from "@/infrastructure/db";
import {
  auditRecords,
  deliveryAreas,
  fulfillmentSlots,
  orderFulfillments,
  orders,
  pickupLocation,
  pickupTimeSlots,
  slotReservations,
  storeSettings,
} from "@/infrastructure/db/schema";
import { eq, inArray } from "drizzle-orm";
import { reserveFulfillmentSlot } from "../inventory/slot-operations";
export async function rescheduleOrder(input: {
  orderId: string;
  slotId: string;
  staffUserId: string;
  reason: string;
}) {
  const id = parseActionUuid(input.orderId, "Order"),
    slotId = parseActionUuid(input.slotId, "Destination slot"),
    reason = parseActionRequiredText(input.reason, "Reschedule reason", 500);
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId);
    await tx.select().from(storeSettings).for("update");
    await acquireTransactionLocks(tx, { orderIds: [id] });
    const [order] = await tx.select().from(orders).where(eq(orders.id, id));
    const [fulfillment] = await tx
      .select()
      .from(orderFulfillments)
      .where(eq(orderFulfillments.orderId, id));
    const [hold] = await tx
      .select()
      .from(slotReservations)
      .where(eq(slotReservations.orderId, id));
    if (
      !order ||
      !hold ||
      hold.status !== "active" ||
      !["unpaid", "confirmed"].includes(order.lifecycleStatus) ||
      fulfillment?.status === "shipped"
    )
      throw new DomainError(
        "Only active undispatched slot bookings can be rescheduled.",
      );
    if (hold.slotId === slotId) return;
    const slots = await tx
      .select()
      .from(fulfillmentSlots)
      .where(inArray(fulfillmentSlots.id, [hold.slotId, slotId]))
      .orderBy(fulfillmentSlots.id)
      .for("update");
    const source = slots.find((s) => s.id === hold.slotId),
      destination = slots.find((s) => s.id === slotId);
    if (!source || !destination)
      throw new DomainError("Destination slot not found.");
    let address = "";
    let locationId = "";
    if (source.deliveryAreaId) {
      if (destination.deliveryAreaId !== source.deliveryAreaId)
        throw new DomainError(
          "Choose another window within the same delivery area.",
        );
      const [area] = await tx
        .select()
        .from(deliveryAreas)
        .where(eq(deliveryAreas.id, source.deliveryAreaId));
      if (!area?.isActive || !area.scheduleRequired)
        throw new DomainError("Delivery schedule is no longer active.");
      validatePickup(
        { ...area, blackoutDates: [] },
        destination.date,
        destination.startTime,
        destination.timezone,
        new Date(),
      );
    } else {
      const [oldPickup] = await tx
        .select()
        .from(pickupTimeSlots)
        .where(eq(pickupTimeSlots.id, source.pickupSlotId!));
      const [newPickup] = await tx
        .select()
        .from(pickupTimeSlots)
        .where(
          eq(
            pickupTimeSlots.id,
            destination.pickupSlotId || "00000000-0000-0000-0000-000000000000",
          ),
        );
      if (
        !oldPickup ||
        !newPickup ||
        oldPickup.locationId !== newPickup.locationId
      )
        throw new DomainError(
          "Choose another window at the same pickup location.",
        );
      const [location] = await tx
        .select()
        .from(pickupLocation)
        .where(eq(pickupLocation.id, newPickup.locationId));
      if (!location) throw new DomainError("Pickup location not found.");
      validatePickup(
        location,
        destination.date,
        destination.startTime,
        destination.timezone,
        new Date(),
      );
      address = location.address;
      locationId = location.id;
    }
    await reserveFulfillmentSlot(tx, id, slotId, hold.id);
    const terms = order.termsSnapshot as Record<string, unknown>;
    const window = {
      date: destination.date,
      startTime: destination.startTime,
      endTime: destination.endTime,
    };
    await tx
      .update(orderFulfillments)
      .set({
        fulfillmentSlotId: destination.id,
        pickupSlotId: destination.pickupSlotId,
        updatedAt: new Date(),
      })
      .where(eq(orderFulfillments.orderId, id));
    await tx
      .update(orders)
      .set({
        termsSnapshot: {
          ...terms,
          ...(destination.deliveryAreaId
            ? {
                delivery: {
                  ...(terms.delivery as Record<string, unknown>),
                  ...window,
                },
              }
            : { pickup: { locationId, address, ...window } }),
        },
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id));
    await tx.insert(auditRecords).values({
      entityType: "order",
      entityId: id,
      actorId: input.staffUserId,
      action: "fulfillment.rescheduled",
      reason,
      details: { sourceSlotId: source.id, destinationSlotId: slotId },
    });
    await schedulePickupReminder(tx, id);
    return { slotId };
  });
}
export async function rescheduleOrderWindow(input: {
  orderId: string;
  staffUserId: string;
  date: string;
  startTime: string;
  reason: string;
}) {
  const id = parseActionUuid(input.orderId, "Order");
  const slotId = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId);
    await tx.select().from(storeSettings).for("update");
    await acquireTransactionLocks(tx, { orderIds: [id] });
    const [hold] = await tx
      .select()
      .from(slotReservations)
      .where(eq(slotReservations.orderId, id));
    if (!hold || hold.status !== "active")
      throw new DomainError("No active booking to reschedule.");
    const [source] = await tx
      .select()
      .from(fulfillmentSlots)
      .where(eq(fulfillmentSlots.id, hold.slotId));
    if (!source) throw new DomainError("Original booking slot not found.");
    if (source.deliveryAreaId) {
      const [area] = await tx
        .select()
        .from(deliveryAreas)
        .where(eq(deliveryAreas.id, source.deliveryAreaId));
      if (!area?.isActive || !area.scheduleRequired)
        throw new DomainError("Delivery schedule is not active.");
      const window = validatePickup(
        { ...area, blackoutDates: [] },
        input.date,
        input.startTime,
        source.timezone,
        new Date(),
      );
      const [target] = await tx
        .insert(fulfillmentSlots)
        .values({
          deliveryAreaId: area.id,
          ...window,
          timezone: source.timezone,
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
      return target!.id;
    }
    const [pickup] = await tx
      .select()
      .from(pickupTimeSlots)
      .where(eq(pickupTimeSlots.id, source.pickupSlotId!));
    const [location] = pickup
      ? await tx
          .select()
          .from(pickupLocation)
          .where(eq(pickupLocation.id, pickup.locationId))
      : [];
    if (!location) throw new DomainError("Pickup location not found.");
    const window = validatePickup(
      location,
      input.date,
      input.startTime,
      source.timezone,
      new Date(),
    );
    const [targetPickup] = await tx
      .insert(pickupTimeSlots)
      .values({ locationId: location.id, ...window })
      .onConflictDoUpdate({
        target: [
          pickupTimeSlots.locationId,
          pickupTimeSlots.date,
          pickupTimeSlots.startTime,
          pickupTimeSlots.endTime,
        ],
        set: { locationId: location.id },
      })
      .returning();
    const [target] = await tx
      .insert(fulfillmentSlots)
      .values({
        pickupSlotId: targetPickup!.id,
        ...window,
        timezone: source.timezone,
        capacity: location.slotCapacity,
      })
      .onConflictDoUpdate({
        target: fulfillmentSlots.pickupSlotId,
        set: { pickupSlotId: targetPickup!.id },
      })
      .returning();
    return target!.id;
  });
  // Provisioning an unused window carries no reservation. The booking swap itself
  // is atomic and revalidates source identity, schedule and capacity under locks.
  return rescheduleOrder({ ...input, slotId });
}
