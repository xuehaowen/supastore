import { customerAccount } from "@/application/use-cases/customers/customer-ownership";
import { customerIdentity } from "@/infrastructure/web";
import { apiResponse, apiInteger } from "@/infrastructure/http/commerce-api";
import { readApiBody, apiText } from "@/infrastructure/http/commerce-api";
import { updateCustomerProfile } from "@/application/use-cases/customers/update-profile";
import type { CustomerAccountDto } from "@supastore/contracts";
export async function PATCH(request: Request) {
  return apiResponse(async () => {
    const b = await readApiBody(request);
    await updateCustomerProfile(await customerIdentity(), {
      name: apiText(b, "name", 200),
      phone: apiText(b, "phone", 40, true),
    });
    return { saved: true };
  });
}
export async function GET(request: Request) {
  return apiResponse(async () => {
    const page = new URL(request.url).searchParams.get("page");
    const a = await customerAccount(
      await customerIdentity(),
      apiInteger({ page: page ? Number(page) : 1 }, "page", 1, 10000),
    );
    return {
      customer: {
        name: a.customer.name,
        email: a.customer.email,
        phone: a.customer.phone,
      },
      orders: a.orders.map((o) => ({
        id: o.id,
        referenceCode: o.referenceCode,
        lifecycleStatus: o.lifecycleStatus,
        purchaseTotalCents: o.purchaseTotalCents,
        createdAt: o.createdAt.toISOString(),
      })),
      addresses: a.addresses.map((a) => ({
        id: a.id,
        label: a.label,
        address: a.address,
      })),
      credit: a.credit
        ? {
            currency: a.credit.account.currency,
            precision: a.credit.account.precision,
            balanceCents: a.credit.account.balanceCents,
            reservedCents: a.credit.account.reservedCents,
            entries: a.credit.entries.map((e) => ({
              id: e.id,
              amountCents: e.amountCents,
              kind: e.kind,
              createdAt: e.createdAt.toISOString(),
            })),
          }
        : null,
      hasNext: a.hasNext,
    } satisfies CustomerAccountDto;
  });
}
