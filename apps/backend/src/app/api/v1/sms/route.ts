import {
  apiResponse,
  apiText,
  readApiBody,
} from "@/infrastructure/http/commerce-api";
import { allowRequest } from "@/application/common/rate-limit";
import { parseActionUuid } from "@/application/common/request-validation";
import { DomainError } from "@/application/common/errors";
import { updateCustomerSms } from "@/application/use-cases/customers/sms-preferences";
import { getNotificationProviders } from "@/infrastructure/bootstrap/notification-providers";
export async function POST(request: Request) {
  return apiResponse(async () => {
    const body = await readApiBody(request);
    const operation = apiText(body, "operation", 20);
    if (!["start", "confirm"].includes(operation))
      throw new DomainError("Invalid SMS operation.");
    if (
      !allowRequest(
        `sms-public:${request.headers.get("x-forwarded-for") || "unknown"}`,
        10,
      )
    )
      throw new DomainError("Please wait before retrying.");
    const providers = getNotificationProviders();
    if (!providers.phone || !providers.sms)
      throw new DomainError(
        "SMS enrollment is temporarily unavailable. You can still place your order without SMS.",
      );
    return updateCustomerSms(
      null,
      {
        operation,
        phone: apiText(body, "phone", 20, true),
        code: apiText(body, "code", 10, true),
        locale: body.locale === "zh" ? "zh" : "en",
        consent: body.consent === true,
        disclosure: apiText(body, "disclosure", 2000, true),
        source: body.source === "checkout" ? "checkout" : "sms-page",
        ...(operation === "confirm"
          ? {
              preferenceId: parseActionUuid(
                apiText(body, "preferenceId"),
                "SMS request",
              ),
            }
          : {}),
      },
      providers.phone,
      true,
    );
  });
}
