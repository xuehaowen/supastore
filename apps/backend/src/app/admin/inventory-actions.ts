"use server";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import { adjustStock } from "@/application/use-cases/inventory/stock-operations";
import { parseActionInteger } from "@/application/common/request-validation";
import { DomainError } from "@/application/common/errors";
export async function countStockAction(form: FormData) {
  let destination = "/admin/inventory?saved=1";
  const text = (key: string) => String(form.get(key) ?? "").trim();
  try {
    await adjustStock({
      staffUserId: await staffIdentity(),
      variantId: text("variantId"),
      onHand: parseActionInteger(text("onHand"), "Counted stock", 0, 1000000),
      tracking: form.has("tracking") && text("tracking") !== "",
      revision: parseActionInteger(text("revision"), "Revision", 1, 2147483647),
      reason: text("reason"),
      requestKey: text("requestKey"),
    });
    revalidatePath("/admin", "layout");
    revalidateTag("catalog");
  } catch (e) {
    destination = `/admin/inventory?error=${encodeURIComponent(e instanceof DomainError ? e.message : "Unable to record count. Please retry.")}`;
  }
  redirect(destination);
}
