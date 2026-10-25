"use server";
import { actionError } from "@/infrastructure/http/failure";
import { adminReturnContext } from "@/application/common/admin-return-context";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import { adjustStock } from "@/application/use-cases/inventory/stock-operations";
import { parseActionInteger } from "@/application/common/request-validation";
export async function countStockAction(form: FormData) {
  const requested = adminReturnContext(String(form.get("returnTo") ?? ""));
  const destination = new URL(
    requested.split("?")[0] === "/admin/inventory"
      ? requested
      : "/admin/inventory",
    "https://admin.invalid",
  );
  destination.searchParams.set("saved", "1");
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
    destination.searchParams.delete("saved");
    destination.searchParams.set(
      "error",
      actionError(
        e,
        "admin.admin.inventory-actions",
        "Unable to record count. Please retry.",
      ),
    );
  }
  redirect(destination.pathname + destination.search);
}
