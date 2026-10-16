"use server";
import { actionError } from "@/infrastructure/http/failure";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import { configureDelivery } from "@/application/use-cases/store/configure-delivery";
import { parseActionInteger } from "@/application/common/request-validation";
import { validateDeliverySchedule } from "@/domain/delivery";
export async function saveDeliveryArea(form: FormData) {
  let target = "/admin/settings/delivery?saved=1";
  const text = (key: string) => String(form.get(key) || "").trim();
  try {
    await configureDelivery({
      staffUserId: await staffIdentity(),
      area: {
        ...(text("id") ? { id: text("id") } : {}),
        name: text("name"),
        countryCodes: text("countryCodes")
          .toUpperCase()
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        postalPrefixes: text("postalPrefixes")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        rateCents: parseActionInteger(
          text("rateCents"),
          "Delivery rate",
          0,
          2147483647,
        ),
        freeThresholdCents: text("freeThresholdCents")
          ? parseActionInteger(
              text("freeThresholdCents"),
              "Free delivery threshold",
              0,
              2147483647,
            )
          : null,
        isActive: form.has("isActive"),
        weeklySchedule: validateDeliverySchedule(
          JSON.parse(text("weeklySchedule") || "{}"),
        ),
        prepMinutes: parseActionInteger(
          text("prepMinutes") || "0",
          "Preparation minutes",
          0,
          525600,
        ),
        scheduleRequired: form.has("scheduleRequired"),
        slotCapacity: text("slotCapacity")
          ? parseActionInteger(
              text("slotCapacity"),
              "Slot capacity",
              0,
              2147483647,
            )
          : null,
      },
    });
    revalidatePath("/admin/settings/delivery");
  } catch (error) {
    target = `/admin/settings/delivery?error=${encodeURIComponent(actionError(error, "admin.admin.settings.delivery.actions", "Unable to save delivery area. Check the values and retry."))}`;
  }
  redirect(target);
}
