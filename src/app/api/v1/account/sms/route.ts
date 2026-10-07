import { customerIdentity } from "@/infrastructure/web";
import { apiResponse, readApiBody, apiText } from "@/infrastructure/http/commerce-api";
import { customerSms, updateCustomerSms } from "@/application/use-cases/customers/sms-preferences";
export async function GET() { return apiResponse(async () => customerSms(await customerIdentity())); }
export async function POST(request: Request) {
  return apiResponse(async () => {
    const body = await readApiBody(request);
    await updateCustomerSms(await customerIdentity(), { operation: apiText(body, "operation", 20), phone: apiText(body, "phone", 20, true), code: apiText(body, "code", 10, true), locale: apiText(body, "locale", 5, true), consent: body.consent === true });
    return { saved: true };
  });
}
