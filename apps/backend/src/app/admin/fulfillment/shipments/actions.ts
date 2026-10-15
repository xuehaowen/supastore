"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import {
  dispatchShipment,
  recordShipmentDelivered,
} from "@/application/use-cases/fulfillment/shipments";
import {
  rescheduleOrder,
  rescheduleOrderWindow,
} from "@/application/use-cases/fulfillment/reschedule-order";
import { DomainError } from "@/application/common/errors";
import { adminOrderReturnContext } from "@/application/common/admin-return-context";
const text = (form: FormData, key: string) => String(form.get(key) || "");
export async function shipmentAction(form: FormData) {
  let target = `/admin/fulfillment/shipments?orderId=${encodeURIComponent(text(form, "orderId"))}`;
  target += `&back=${encodeURIComponent(adminOrderReturnContext(text(form, "orderId"), text(form, "back")))}`;
  try {
    const staffUserId = await staffIdentity();
    switch (text(form, "operation")) {
      case "reschedule":
        if (!text(form, "slotId")) {
          await rescheduleOrderWindow({
            staffUserId,
            orderId: text(form, "orderId"),
            date: text(form, "date"),
            startTime: text(form, "startTime"),
            reason: text(form, "reason"),
          });
          break;
        }
        await rescheduleOrder({
          staffUserId,
          orderId: text(form, "orderId"),
          slotId: text(form, "slotId"),
          reason: text(form, "reason"),
        });
        break;
      case "delivered":
        await recordShipmentDelivered({
          staffUserId,
          shipmentId: text(form, "shipmentId"),
        });
        break;
      case "dispatch":
        await dispatchShipment({
          staffUserId,
          orderId: text(form, "orderId"),
          carrier: text(form, "carrier"),
          trackingNumber: text(form, "trackingNumber"),
          provider: text(form, "provider"),
          requestKey: text(form, "requestKey"),
          items: [...form.entries()]
            .filter(([key]) => key.startsWith("item:"))
            .map(([key, value]) => ({
              orderItemId: key.slice(5),
              quantity: Number(value),
            }))
            .filter((line) => line.quantity !== 0),
        });
        break;
      default:
        throw new DomainError("Unknown fulfillment action.");
    }
    revalidatePath("/admin/fulfillment");
    revalidatePath(`/admin/orders/${text(form, "orderId")}`);
    target += "&saved=1";
  } catch (error) {
    target += `&error=${encodeURIComponent(error instanceof DomainError ? error.message : "Unable to save fulfillment. Retry or ask the owner to review.")}`;
  }
  redirect(target);
}
