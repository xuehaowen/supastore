"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import { DomainError } from "@/application/common/errors";
import { parseActionUuid } from "@/application/common/request-validation";
import { resolveRewardFundingReview } from "@/application/use-cases/store-credit/resolve-reward-review";
import { adminOrderReturnContext } from "@/application/common/admin-return-context";
export async function resolveRewardReviewAction(form: FormData) {
  const orderId = parseActionUuid(String(form.get("orderId")), "Order");
  const destination = new URL(
    adminOrderReturnContext(orderId, String(form.get("returnTo") ?? "")),
    "https://admin.invalid",
  );
  try {
    await resolveRewardFundingReview({
      orderId,
      actorId: await staffIdentity(),
      requestKey: String(form.get("requestKey")),
      reason: String(form.get("reason") ?? ""),
    });
    revalidatePath(destination.pathname);
    revalidatePath("/admin/store-credit");
  } catch (error) {
    destination.searchParams.set(
      "error",
      error instanceof DomainError
        ? error.message
        : "Reward review could not be resolved. Verify the original receipt history.",
    );
  }
  redirect(destination.pathname + destination.search);
}
