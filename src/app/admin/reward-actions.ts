"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import { DomainError } from "@/application/common/errors";
import { parseActionUuid } from "@/application/common/request-validation";
import { resolveRewardFundingReview } from "@/application/use-cases/store-credit/resolve-reward-review";
export async function resolveRewardReviewAction(form: FormData) {
  const orderId = parseActionUuid(String(form.get("orderId")), "Order");
  let destination = `/admin/orders/${orderId}`;
  try {
    await resolveRewardFundingReview({
      orderId,
      actorId: await staffIdentity(),
      requestKey: String(form.get("requestKey")),
      reason: String(form.get("reason") ?? ""),
    });
    revalidatePath(destination);
    revalidatePath("/admin/store-credit");
  } catch (error) {
    destination += `?error=${encodeURIComponent(error instanceof DomainError ? error.message : "Reward review could not be resolved. Verify the original receipt history.")}`;
  }
  redirect(destination);
}
