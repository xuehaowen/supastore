"use server";
import { actionError } from "@/infrastructure/http/failure";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import {
  configureSlotQuota,
  configureFulfillmentSlot,
} from "@/application/use-cases/inventory/slot-operations";
import { DomainError } from "@/application/common/errors";
import { parseActionInteger } from "@/application/common/request-validation";
export async function saveSlotQuota(form: FormData) {
  let destination = "/admin/inventory/slots?saved=1";
  try {
    await configureSlotQuota({
      staffUserId: await staffIdentity(),
      slotId: String(form.get("slotId") ?? ""),
      variantId: String(form.get("variantId") ?? ""),
      quantity: parseActionInteger(
        form.get("quantity"),
        "Quantity",
        0,
        2147483647,
      ),
    });
    revalidatePath("/admin/inventory/slots");
  } catch (error) {
    destination = `/admin/inventory/slots?error=${encodeURIComponent(actionError(error, "admin.admin.inventory.slots.actions", "Unable to save quota."))}`;
  }
  redirect(destination);
}
export async function createSlot(form: FormData) {
  let destination = "/admin/inventory/slots?saved=1";
  try {
    const target = String(form.get("location") ?? "");
    const [method, locationId] = target.split(":");
    if (method !== "pickup" && method !== "local_delivery")
      throw new DomainError("Choose a location.");
    await configureFulfillmentSlot({
      staffUserId: await staffIdentity(),
      method,
      locationId: locationId ?? "",
      date: String(form.get("date") ?? ""),
      startTime: String(form.get("startTime") ?? ""),
    });
    revalidatePath("/admin/inventory/slots");
  } catch (error) {
    destination = `/admin/inventory/slots?error=${encodeURIComponent(actionError(error, "admin.admin.inventory.slots.actions", "Choose a valid scheduled window."))}`;
  }
  redirect(destination);
}
