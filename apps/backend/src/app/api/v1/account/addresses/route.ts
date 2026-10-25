import { saveCustomerAddress } from "@/application/use-cases/customers/customer-ownership";
import { customerIdentity } from "@/infrastructure/web";
import {
  apiResponse,
  readApiBody,
  apiText,
} from "@/infrastructure/http/commerce-api";
import { parseActionUuid } from "@/application/common/request-validation";
export async function POST(request: Request) {
  return apiResponse(async () => {
    const b = await readApiBody(request);
    const address = Object.fromEntries(
      [
        "name",
        "line1",
        "line2",
        "city",
        "region",
        "postalCode",
        "country",
        "phone",
      ].map((key) => [key, apiText(b, key, 200, true)]),
    );
    await saveCustomerAddress({
      userId: await customerIdentity(),
      ...(b.id ? { id: parseActionUuid(apiText(b, "id"), "Address") } : {}),
      label: apiText(b, "label", 100),
      remove: b.remove === true,
      address,
    });
    return { saved: true };
  });
}
