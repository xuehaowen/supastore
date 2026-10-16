"use server";
import { actionError } from "@/infrastructure/http/failure";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import { recordOutsideSales } from "@/application/use-cases/reports/sales-report";
import { parseActionInteger } from "@/application/common/request-validation";
export async function adjustOutsideSales(form: FormData) {
  let target = "/admin/reports?saved=1";
  try {
    await recordOutsideSales({
      actorUserId: await staffIdentity(),
      saleDate: String(form.get("saleDate") ?? ""),
      netCents: parseActionInteger(
        form.get("netCents"),
        "Net sales",
        -2147483647,
        2147483647,
      ),
      taxCents: parseActionInteger(
        form.get("taxCents"),
        "Tax",
        -2147483647,
        2147483647,
      ),
      reason: String(form.get("reason") ?? ""),
      requestKey: String(form.get("requestKey") ?? ""),
    });
    revalidatePath("/admin/reports");
  } catch (error) {
    target = `/admin/reports?error=${encodeURIComponent(actionError(error, "admin.admin.reports.actions", "Check the adjustment values and retry."))}`;
  }
  redirect(target);
}
