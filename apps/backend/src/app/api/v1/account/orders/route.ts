import {
  claimGuestOrder,
  openOwnedOrder,
} from "@/application/use-cases/customers/customer-ownership";
import {
  customerIdentity,
  orderToken,
  setOrderToken,
} from "@/infrastructure/web";
import {
  apiResponse,
  readApiBody,
  apiText,
} from "@/infrastructure/http/commerce-api";
import { parseActionUuid } from "@/application/common/request-validation";
export async function POST(request: Request) {
  return apiResponse(async () => {
    const b = await readApiBody(request);
    const id = parseActionUuid(apiText(b, "orderId"), "Order");
    const proof = await openOwnedOrder(await customerIdentity(), id);
    await setOrderToken(id, proof.rawToken);
    return { orderId: id };
  });
}
export async function PUT(request: Request) {
  return apiResponse(async () => {
    const b = await readApiBody(request);
    const orderId = parseActionUuid(apiText(b, "orderId"), "Order");
    await claimGuestOrder({
      userId: await customerIdentity(),
      orderId,
      token: await orderToken(orderId),
    });
    return { claimed: true };
  });
}
