import { eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  deliveryAreas,
  storeSettings,
  auditRecords,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { parseActionUuid } from "@/application/common/request-validation";
import { NotFoundError } from "@/application/common/errors";
import { validateDeliveryArea, type DeliveryArea } from "@/domain/delivery";
import { updateConfiguredSlotCapacity } from "./slot-capacity";
export async function configureDelivery(input: {
  staffUserId: string;
  area: Omit<DeliveryArea, "id"> & { id?: string };
}) {
  const values = validateDeliveryArea(input.area);
  const id = input.area.id
    ? parseActionUuid(input.area.id, "Delivery area")
    : undefined;
  const { id: _ignored, ...area } = { ...values, id };
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    const [store] = await tx
      .select()
      .from(storeSettings)
      .for("update")
      .limit(1);
    if (!store) throw new NotFoundError("Store settings not found.");
    if (id)
      await updateConfiguredSlotCapacity(
        tx,
        { deliveryAreaId: id },
        area.slotCapacity,
      );
    const [saved] = id
      ? await tx
          .update(deliveryAreas)
          .set({ ...area, updatedAt: new Date() })
          .where(eq(deliveryAreas.id, id))
          .returning()
      : await tx.insert(deliveryAreas).values(area).returning();
    if (!saved) throw new NotFoundError("Delivery area not found.");
    await tx
      .update(storeSettings)
      .set({
        quoteVersion: sql`${storeSettings.quoteVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(storeSettings.id, store.id));
    await tx.insert(auditRecords).values({
      entityType: "store",
      entityId: store.id,
      actorId: input.staffUserId,
      action: "delivery.area_saved",
      details: { areaId: saved.id, isActive: saved.isActive },
    });
    return saved;
  });
}
