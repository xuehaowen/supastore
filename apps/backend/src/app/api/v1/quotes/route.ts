import { parseQuoteRequest } from "@/application/common/quote-request";
import { getQuote } from "@/application/use-cases/get-quote";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
import { customerAccount } from "@/application/use-cases/customers/customer-ownership";
import { DomainError } from "@/application/common/errors";
import { apiResponse, readApiBody } from "@/infrastructure/http/commerce-api";
import { guestIdentity, customerIdentity } from "@/infrastructure/web";
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
        ...(fields.recipientName
          ? { recipientName: fields.recipientName }
          : {}),
        ...(fields.line2 ? { line2: fields.line2 } : {}),
        ...(fields.city ? { city: fields.city } : {}),
        region: fields.region,
        postalCode: fields.postalCode,
      },
    });
    const terms = q.termsSnapshot as QuoteTerms;
    if (q.totalPayableCents > 0 && !terms.payment && !terms.onlinePayment) {
      const userId = await customerIdentity();
      const customer = userId ? await customerAccount(userId) : null;
      const credit = customer?.credit?.reconciled
        ? customer.credit.account.balanceCents -
          customer.credit.account.reservedCents
        : 0;
      if (credit < q.totalPayableCents)
        throw new DomainError("Choose an active payment method.");
    }
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
