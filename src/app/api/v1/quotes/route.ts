import { getQuote } from "@/application/use-cases/get-quote";
import {
  apiResponse,
  readApiBody,
  apiText,
} from "@/infrastructure/http/commerce-api";
import { guestIdentity } from "@/infrastructure/web";
import {
  parseActionEnum,
  parseActionUuid,
} from "@/application/common/request-validation";
export async function POST(request: Request) {
  return apiResponse(async () => {
    const b = await readApiBody(request);
    const uuid = (key: string) => parseActionUuid(apiText(b, key), key);
    const q = await getQuote({
      guestSessionId: await guestIdentity(),
      cartId: parseActionUuid(apiText(b, "cartId"), "Cart"),
      fulfillmentType: parseActionEnum(
        apiText(b, "fulfillmentType"),
        "Fulfillment",
        ["shipping", "pickup", "local_delivery"] as const,
      ),
      shippingAddress: {
        country: apiText(b, "country", 2, true).toUpperCase(),
        address: apiText(b, "address", 2000, true),
        postalCode: apiText(b, "postalCode", 40, true),
        region: apiText(b, "region", 12, true).trim().toUpperCase(),
      },
      pickupDate: apiText(b, "pickupDate", 10, true),
      pickupTime: apiText(b, "pickupTime", 20, true),
      ...(b.pickupLocationId
        ? { pickupLocationId: uuid("pickupLocationId") }
        : {}),
      ...(b.paymentAccountId
        ? { paymentAccountId: uuid("paymentAccountId") }
        : {}),
      ...(b.deliveryAreaId ? { deliveryAreaId: uuid("deliveryAreaId") } : {}),
      promotionCode: apiText(b, "promotionCode", 100, true),
    });
    return {
      id: q.id,
      cartId: q.cartId,
      expiresAt: q.expiresAt,
      merchandiseSubtotalCents: q.merchandiseSubtotalCents,
      shippingCents: q.shippingCents,
      inclusiveTaxCents: q.inclusiveTaxCents,
      exclusiveTaxCents: q.exclusiveTaxCents,
      discountCents: q.discountCents,
      totalPayableCents: q.totalPayableCents,
      items: q.itemsSnapshot,
    };
  });
}
