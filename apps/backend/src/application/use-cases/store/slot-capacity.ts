import { and, eq, inArray, sql } from "drizzle-orm";
import type { Transaction } from "@/application/common/transaction";
import {
  fulfillmentSlots,
  slotReservations,
  pickupTimeSlots,
} from "@/infrastructure/db/schema";
import { DomainError } from "@/application/common/errors";
// Call after locking store_settings. Slot locks serialize booking and capacity edits.
export async function updateConfiguredSlotCapacity(
  tx: Transaction,
  owner: { deliveryAreaId: string } | { pickupLocationId: string },
  capacity: number | null,
) {
  const condition =
    "deliveryAreaId" in owner
      ? eq(fulfillmentSlots.deliveryAreaId, owner.deliveryAreaId)
      : inArray(
          fulfillmentSlots.pickupSlotId,
          tx
            .select({ id: pickupTimeSlots.id })
            .from(pickupTimeSlots)
            .where(eq(pickupTimeSlots.locationId, owner.pickupLocationId)),
        );
  const slots = await tx
    .select({ id: fulfillmentSlots.id })
    .from(fulfillmentSlots)
    .where(condition)
    .orderBy(fulfillmentSlots.id)
    .for("update");
  for (const slot of slots) {
    const [usage] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(slotReservations)
      .where(
        and(
          eq(slotReservations.slotId, slot.id),
          inArray(slotReservations.status, ["active", "consumed"]),
        ),
      );
    if (capacity !== null && capacity < (usage?.count || 0))
      throw new DomainError(
        "Slot capacity cannot be below already booked orders.",
      );
  }
  if (slots.length)
    await tx
      .update(fulfillmentSlots)
      .set({ capacity })
      .where(
        inArray(
          fulfillmentSlots.id,
          slots.map((slot) => slot.id),
        ),
      );
}
