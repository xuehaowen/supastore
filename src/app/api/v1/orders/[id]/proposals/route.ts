import { acceptOrderChange } from "@/application/use-cases/order-proposals";
import { orderToken } from "@/infrastructure/web";
import {
  apiResponse,
  readApiBody,
  apiText,
} from "@/infrastructure/http/commerce-api";
import { parseActionUuid } from "@/application/common/request-validation";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return apiResponse(async () => {
    const b = await readApiBody(request);
    const orderId = parseActionUuid((await context.params).id, "Order");
    await acceptOrderChange({
      orderId,
      proposalId: parseActionUuid(apiText(b, "proposalId"), "Proposal"),
      sessionToken: await orderToken(orderId),
    });
    return { accepted: true };
  });
}
