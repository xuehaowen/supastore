import { startStripeCheckout } from "@/application/use-cases/payments/stripe-checkout";
import { orderToken, localeOf } from "@/infrastructure/web";
import {
  apiResponse,
  readApiBody,
  apiText,
} from "@/infrastructure/http/commerce-api";
import { parseActionUuid } from "@/application/common/request-validation";
import { allowRequest } from "@/application/common/rate-limit";
import { DomainError } from "@/application/common/errors";
export async function POST(request: Request) {
  return apiResponse(async () => {
    const b = await readApiBody(request);
    const orderId = parseActionUuid(apiText(b, "orderId"), "Order");
    if (!allowRequest(`stripe-checkout:${orderId}`, 10))
      throw new DomainError("Please wait before retrying payment.");
    return startStripeCheckout({
      orderId,
      sessionToken: await orderToken(orderId),
      locale: localeOf(b.locale),
    });
  });
}
