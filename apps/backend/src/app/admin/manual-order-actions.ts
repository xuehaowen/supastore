"use server";

import { revalidatePath } from "next/cache";
import { describeFailure } from "@/infrastructure/http/failure";
import { createManualOrder } from "@/application/use-cases/create-manual-order";
import { staffIdentity } from "@/infrastructure/web";
import { parseManualOrderForm } from "./manual-order-request";

export async function submitManualOrder(
  form: FormData,
): Promise<{ error: string; requestId?: string } | { referenceCode: string }> {
  try {
    const order = await createManualOrder({
      ...parseManualOrderForm(form),
      staffUserId: await staffIdentity(),
    });
    revalidatePath("/admin", "layout");
    return { referenceCode: order.referenceCode };
  } catch (error) {
    const failure = describeFailure(
      error,
      "admin.manual_order",
      "Unable to save. Please retry.",
    );
    return {
      error: failure.message,
      ...(failure.status >= 500 ? { requestId: failure.requestId } : {}),
    };
  }
}
