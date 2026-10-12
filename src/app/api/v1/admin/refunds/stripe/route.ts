import { sendStripeRefund } from "@/application/use-cases/payments/stripe-refund";
import { staffIdentity } from "@/infrastructure/web";
import {
  apiResponse,
  readApiBody,
  apiText,
} from "@/infrastructure/http/commerce-api";
export async function POST(request: Request) {
  return apiResponse(async () => {
    const b = await readApiBody(request);
    return sendStripeRefund({
      allocationId: apiText(b, "allocationId"),
      ownerUserId: await staffIdentity(),
    });
  });
}
