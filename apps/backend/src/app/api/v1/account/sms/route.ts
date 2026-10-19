import { customerIdentity } from "@/infrastructure/web";
import {
  apiResponse,
  readApiBody,
  apiText,
} from "@/infrastructure/http/commerce-api";
import {
  customerSms,
  updateCustomerSms,
} from "@/application/use-cases/customers/sms-preferences";
import { getNotificationProviders } from "@/infrastructure/bootstrap/notification-providers";
import { db } from "@/infrastructure/db";
import { storeSettings } from "@/infrastructure/db/schema";
import { smsReadiness } from "@supastore/contracts";
export async function GET() {
  return apiResponse(async () => {
    const [store] = await db.select().from(storeSettings).limit(1);
    const providers = getNotificationProviders();
    return customerSms(
      await customerIdentity(),
      smsReadiness(store).enabled && Boolean(providers.sms && providers.phone),
    );
  });
}
export async function POST(request: Request) {
  return apiResponse(async () => {
    const body = await readApiBody(request);
    const operation = apiText(body, "operation", 20);
    const customer = await customerIdentity();
    // Withdrawing consent must remain available even if transport configuration fails.
    if (operation === "disable") {
      await updateCustomerSms(customer, { operation });
      return { saved: true };
    }
    const providers = getNotificationProviders();
    await updateCustomerSms(
      customer,
      {
        operation,
        phone: apiText(body, "phone", 20, true),
        code: apiText(body, "code", 10, true),
        locale: apiText(body, "locale", 5, true),
        consent: body.consent === true,
      },
      providers.phone,
      Boolean(providers.phone && providers.sms),
    );
    return { saved: true };
  });
}
