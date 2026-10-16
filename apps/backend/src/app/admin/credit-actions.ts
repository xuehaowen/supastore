"use server";
import { actionError } from "@/infrastructure/http/failure";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import { issueStoreCredit } from "@/application/use-cases/store-credit/credit-operations";
import { refundPurchase } from "@/application/use-cases/store-credit/purchase-refund";
import { parseActionInteger } from "@/application/common/request-validation";
import { adminOrderReturnContext } from "@/application/common/admin-return-context";
const text = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
export async function issueCreditAction(form: FormData) {
  let destination = "/admin/store-credit";
  try {
    const id = await issueStoreCredit({
      staffUserId: await staffIdentity(),
      customerId: text(form, "customerId"),
      amountCents: parseActionInteger(
        text(form, "amountCents"),
        "Credit amount",
        1,
        2147483647,
      ),
      reason: text(form, "reason"),
      requestKey: text(form, "requestKey"),
      ...(text(form, "reversalOfId")
        ? { reversalOfId: text(form, "reversalOfId") }
        : {}),
    });
    destination = `/admin/store-credit/${id}?saved=1`;
    revalidatePath("/admin", "layout");
    revalidatePath("/[locale]/account", "page");
  } catch (e) {
    destination += `?error=${encodeURIComponent(actionError(e, "admin.admin.credit-actions", "Unable to save credit. Please retry."))}`;
  }
  redirect(destination);
}
export async function refundPurchaseAction(form: FormData) {
  const orderId = text(form, "orderId");
  const destination = new URL(
    adminOrderReturnContext(orderId, text(form, "returnTo")),
    "https://admin.invalid",
  );
  try {
    const components = [
      ...new Set(
        [...form.keys()]
          .filter(
            (key) => key.startsWith("external:") || key.startsWith("credit:"),
          )
          .map((key) => key.slice(key.indexOf(":") + 1)),
      ),
    ]
      .map((componentId) => ({
        componentId,
        externalCents: parseActionInteger(
          String(form.get(`external:${componentId}`) ?? "0"),
          "External component refund",
          0,
          2147483647,
        ),
        creditCents: parseActionInteger(
          String(form.get(`credit:${componentId}`) ?? "0"),
          "Credit component refund",
          0,
          2147483647,
        ),
      }))
      .filter((item) => item.externalCents || item.creditCents);
    await refundPurchase({
      orderId,
      ownerUserId: await staffIdentity(),
      amountCents: parseActionInteger(
        text(form, "amountCents"),
        "Refund amount",
        1,
        2147483647,
      ),
      reason: text(form, "reason"),
      requestKey: text(form, "requestKey"),
      ...(components.length ? { componentRefunds: components } : {}),
    });
    revalidatePath("/admin", "layout");
    revalidatePath("/[locale]/account", "page");
    destination.searchParams.set("saved", "1");
  } catch (e) {
    destination.searchParams.set(
      "error",
      actionError(
        e,
        "admin.admin.credit-actions",
        "Unable to authorize refund.",
      ),
    );
  }
  redirect(destination.pathname + destination.search);
}
