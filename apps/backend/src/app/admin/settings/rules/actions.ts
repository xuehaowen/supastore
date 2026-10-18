"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { staffIdentity } from "@/infrastructure/web";
import { actionError } from "@/infrastructure/http/failure";
import {
  saveCommerceRule,
  deleteCommerceRule,
} from "@/application/use-cases/commerce/manage-commerce-rules";
import { parseActionInteger } from "@/application/common/request-validation";
export async function submitCommerceRule(
  _state: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  try {
    const actor = {
      staffUserId: await staffIdentity(),
      expectedVersion: parseActionInteger(
        String(form.get("version")),
        "Revision",
        1,
        2147483647,
      ),
    };
    const id = String(form.get("id"));
    if (form.get("intent") === "delete")
      await deleteCommerceRule({ ...actor, id });
    else {
      const list = (key: string) =>
        String(form.get(key) ?? "")
          .split(",")
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean);
      const method = String(form.get("method") ?? "");
      const pickup = String(form.get("pickupLocationId") ?? "");
      const variantId = String(form.get("variantId") ?? "");
      const kind = String(form.get("kind"));
      await saveCommerceRule({
        ...actor,
        rule: {
          id,
          name: String(form.get("name") ?? ""),
          kind,
          enabled: form.has("enabled"),
          priority: parseActionInteger(
            String(form.get("priority")),
            "Priority",
            0,
            10000,
          ),
          value:
            kind === "promotion"
              ? 0
              : parseActionInteger(
                  String(form.get("value")),
                  "Value",
                  0,
                  2147483647,
                ),
          variantIds: variantId ? [variantId] : [],
          ...(kind === "promotion"
            ? {
                promotionCode: String(form.get("promotionCode") ?? "")
                  .trim()
                  .toUpperCase(),
              }
            : {}),
          conditions: {
            fulfillmentMethods: method ? [method] : [],
            countries: list("countries"),
            regions: list("regions"),
            postalPrefixes: list("postalPrefixes"),
            pickupLocationIds: pickup ? [pickup] : [],
            startsAt: String(form.get("startsAt") ?? "").trim() || null,
            endsAt: String(form.get("endsAt") ?? "").trim() || null,
          },
        },
      });
    }
    revalidatePath("/admin", "layout");
  } catch (error) {
    return {
      error: actionError(
        error,
        "admin.commerce.rules",
        "Rule could not be saved. Check its conditions, targets and priority.",
      ),
    };
  }
  redirect("/admin/settings/rules?saved=1");
}
