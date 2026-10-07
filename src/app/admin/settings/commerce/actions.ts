"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import { updateStoreSettings } from "@/application/use-cases/store/update-store-settings";
import { parseActionInteger } from "@/application/common/request-validation";
import { DomainError } from "@/application/common/errors";
export async function saveCommercePolicy(form: FormData) {
  let target = "/admin/settings/commerce?saved=1";
  try {
    await updateStoreSettings({
      staffUserId: await staffIdentity(),
      commercePolicy: {
        guestCheckout: form.has("guestCheckout"),
        rewardsEnabled: form.has("rewardsEnabled"),
        rewardEligibleCategoryIds: form.getAll("rewardEligibleCategoryIds").map(String),
        rewardsStartAt: String(form.get("rewardsStartAt") ?? "").trim() || null,
        rewardsEndAt: String(form.get("rewardsEndAt") ?? "").trim() || null,
        rewardRateBasisPoints: parseActionInteger(
          String(form.get("rewardRateBasisPoints")),
          "Reward rate",
          0,
          10000,
        ),
        shippingEnabled: form.has("shippingEnabled"),
        pickupEnabled: form.has("pickupEnabled"),
        deliveryEnabled: form.has("deliveryEnabled"),
        fiscalYearStartMonth: parseActionInteger(
          String(form.get("fiscalYearStartMonth") ?? "1"),
          "Fiscal year start month",
          1,
          12,
        ),
        salesThresholdCents: String(
          form.get("salesThresholdCents") ?? "",
        ).trim()
          ? parseActionInteger(
              String(form.get("salesThresholdCents")),
              "Sales threshold",
              1,
              2147483647,
            )
          : null,
      },
    });
    revalidatePath("/admin", "layout");
  } catch (error) {
    target = `/admin/settings/commerce?error=${encodeURIComponent(error instanceof DomainError ? error.message : "Invalid settings. Check the values and retry.")}`;
  }
  redirect(target);
}
