"use server";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { staffIdentity, orderToken, localeOf } from "@/infrastructure/web";
import {
  requestGoodsReturn,
  reviewGoodsReturn,
  receiveGoodsReturn,
} from "@/application/use-cases/returns/manage-returns";
import { parseActionInteger } from "@/application/common/request-validation";
import { DomainError } from "@/application/common/errors";
const text = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
async function perform(path: string, work: () => Promise<void>) {
  let destination = path;
  try {
    await work();
    destination += (destination.includes("?") ? "&" : "?") + "saved=1";
    revalidatePath("/admin", "layout");
    revalidatePath("/[locale]/orders/[id]", "page");
    revalidateTag("catalog");
  } catch (e) {
    destination += `${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent(e instanceof DomainError ? e.message : "Unable to save return.")}`;
  }
  redirect(destination);
}
export async function requestReturnAction(form: FormData) {
  const id = text(form, "orderId"),
    locale = localeOf(form.get("locale"));
  const path = /^[0-9a-f-]{36}$/i.test(id)
    ? `/${locale}/orders/${id}`
    : locale === "zh"
      ? "/recover?locale=zh"
      : "/recover";
  return perform(path, async () => {
    const items = form
      .getAll("itemIds")
      .map((value) => ({
        orderItemId: String(value),
        quantity: parseActionInteger(
          text(form, `quantity.${value}`) || "0",
          "Return quantity",
          0,
          999,
        ),
      }))
      .filter((i) => i.quantity > 0);
    await requestGoodsReturn({
      orderId: id,
      token: await orderToken(id),
      requestKey: text(form, "requestKey"),
      reason: text(form, "reason"),
      items,
    });
  });
}
export async function reviewReturnAction(form: FormData) {
  const id = text(form, "returnId");
  return perform(
    /^[0-9a-f-]{36}$/i.test(id) ? `/admin/returns/${id}` : "/admin/returns",
    async () => {
      const decision = text(form, "decision");
      if (
        decision !== "approved" &&
        decision !== "rejected" &&
        decision !== "cancelled"
      )
        throw new DomainError("Invalid decision.");
      await reviewGoodsReturn({
        staffUserId: await staffIdentity(),
        returnId: id,
        decision,
        reason: text(form, "reason"),
      });
    },
  );
}
export async function receiveReturnAction(form: FormData) {
  const id = text(form, "returnId");
  return perform(
    /^[0-9a-f-]{36}$/i.test(id) ? `/admin/returns/${id}` : "/admin/returns",
    async () => {
      await receiveGoodsReturn({
        staffUserId: await staffIdentity(),
        returnId: id,
        items: form.getAll("itemIds").map((value) => ({
          returnItemId: String(value),
          restock: parseActionInteger(
            text(form, `restock.${value}`),
            "Restockable quantity",
            0,
            999,
          ),
          damaged: parseActionInteger(
            text(form, `damaged.${value}`),
            "Damaged quantity",
            0,
            999,
          ),
        })),
      });
    },
  );
}
