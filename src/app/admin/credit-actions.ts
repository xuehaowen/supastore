"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import { issueStoreCredit } from "@/application/use-cases/store-credit/credit-operations";
import { refundPurchase } from "@/application/use-cases/store-credit/purchase-refund";
import { DomainError } from "@/application/common/errors";
import { parseActionInteger } from "@/application/common/request-validation";
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
    destination += `?error=${encodeURIComponent(e instanceof DomainError ? e.message : "Unable to save credit. Please retry.")}`;
  }
  redirect(destination);
}
export async function refundPurchaseAction(form: FormData) {
  const orderId = text(form, "orderId");
  let destination = /^[0-9a-f-]{36}$/i.test(orderId)
    ? `/admin/orders/${orderId}`
    : "/admin/orders";
  try {
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
    });
    revalidatePath("/admin", "layout");
    revalidatePath("/[locale]/account", "page");
    destination += "?saved=1";
  } catch (e) {
    destination += `?error=${encodeURIComponent(e instanceof DomainError ? e.message : "Unable to authorize refund.")}`;
  }
  redirect(destination);
}
