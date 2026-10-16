"use server";

import { revalidatePath } from "next/cache";
import { ValiError } from "valibot";
import { DomainError } from "@/application/common/errors";
import { createManualOrder } from "@/application/use-cases/create-manual-order";
import { staffIdentity } from "@/infrastructure/web";
import { parseManualOrderForm } from "./manual-order-request";

export async function submitManualOrder(
  form: FormData,
): Promise<{ error: string } | { referenceCode: string }> {
  try {
    const order = await createManualOrder({
      ...parseManualOrderForm(form),
      staffUserId: await staffIdentity(),
    });
    revalidatePath("/admin", "layout");
    return { referenceCode: order.referenceCode };
  } catch (error) {
    return {
      error:
        error instanceof DomainError || error instanceof ValiError
          ? error.message
          : "Unable to save. Check your entries and try again.",
    };
  }
}
