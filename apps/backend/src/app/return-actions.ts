"use server";
import { actionError } from "@/infrastructure/http/failure";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import {
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
    revalidateTag("catalog");
  } catch (e) {
    destination += `${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent(actionError(e, "admin.return-actions", "Unable to save return."))}`;
  }
  redirect(destination);
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
