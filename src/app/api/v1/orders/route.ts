import { createOrder } from "@/application/use-cases/create-order";
import {
  apiResponse,
  readApiBody,
  apiText,
  apiInteger,
} from "@/infrastructure/http/commerce-api";
import {
  guestIdentity,
  customerIdentity,
  setOrderToken,
} from "@/infrastructure/web";
import { parseActionUuid } from "@/application/common/request-validation";
import { DomainError } from "@/application/common/errors";
import { allowRequest } from "@/application/common/rate-limit";
export async function POST(request: Request) {
  return apiResponse(async () => {
    const body = await readApiBody(request);
    if (body.accepted !== true)
      throw new DomainError("Accept the final total before placing an order.");
    const guestSessionId = await guestIdentity();
    if (!allowRequest("checkout:" + guestSessionId, 20))
      throw new DomainError("Please wait before retrying.");
    const customerUserId = await customerIdentity();
    const order = await createOrder({
      locale: body.locale === "zh" ? "zh" : "en",
      quoteId: parseActionUuid(apiText(body, "quoteId"), "Quote"),
      guestSessionId,
      guestName: apiText(body, "name", 200),
      guestEmail: apiText(body, "email", 254),
      ...(customerUserId ? { customerUserId } : {}),
      creditAppliedCents: apiInteger(
        body,
        "creditAppliedCents",
        0,
        2147483647,
        0,
      ),
    });
    await setOrderToken(order.id, order.sessionToken);
    return {
      id: order.id,
      referenceCode: order.referenceCode,
      lifecycleStatus: order.lifecycleStatus,
      purchaseTotalCents: order.purchaseTotalCents,
    };
  });
}
