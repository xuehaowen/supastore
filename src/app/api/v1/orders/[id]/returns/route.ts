import { requestGoodsReturn } from "@/application/use-cases/returns/manage-returns";
import { orderToken } from "@/infrastructure/web";
import {
  apiResponse,
  readApiBody,
  apiText,
  apiInteger,
} from "@/infrastructure/http/commerce-api";
import { parseActionUuid } from "@/application/common/request-validation";
import { DomainError } from "@/application/common/errors";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return apiResponse(async () => {
    const body = await readApiBody(request);
    const orderId = parseActionUuid((await context.params).id, "Order");
    if (
      !Array.isArray(body.items) ||
      !body.items.length ||
      body.items.length > 50
    )
      throw new DomainError("Choose between one and 50 distinct order items.");
    const items = body.items.map((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item))
        throw new DomainError("Invalid return item.");
      const value = item as Record<string, unknown>;
      return {
        orderItemId: parseActionUuid(
          apiText(value, "orderItemId"),
          "Order item",
        ),
        quantity: apiInteger(value, "quantity", 1, 999),
      };
    });
    const id = await requestGoodsReturn({
      orderId,
      token: await orderToken(orderId),
      requestKey: parseActionUuid(apiText(body, "requestKey"), "Request key"),
      reason: apiText(body, "reason", 500),
      items,
    });
    return { id };
  });
}
