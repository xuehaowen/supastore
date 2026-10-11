import { parseQuoteRequest } from "@/application/common/quote-request";
import { getQuote } from "@/application/use-cases/get-quote";
import { apiResponse, readApiBody } from "@/infrastructure/http/commerce-api";
import { guestIdentity } from "@/infrastructure/web";
import { parseQuoteDto } from "@supastore/contracts";
export async function POST(request: Request) {
  return apiResponse(async () => {
    const b = await readApiBody(request);
    const fields = parseQuoteRequest(b);
    const q = await getQuote({
      ...fields,
      guestSessionId: await guestIdentity(),
      shippingAddress: {
        country: fields.country,
        address: fields.address,
        region: fields.region,
        postalCode: fields.postalCode,
      },
    });
    return parseQuoteDto({
      id: q.id,
      cartId: q.cartId,
      expiresAt: q.expiresAt.toISOString(),
      merchandiseSubtotalCents: q.merchandiseSubtotalCents,
      shippingCents: q.shippingCents,
      inclusiveTaxCents: q.inclusiveTaxCents,
      exclusiveTaxCents: q.exclusiveTaxCents,
      discountCents: q.discountCents,
      totalPayableCents: q.totalPayableCents,
      items: q.itemsSnapshot,
    });
  });
}
