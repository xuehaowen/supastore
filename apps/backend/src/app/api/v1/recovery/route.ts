import { requestTrackingLink } from "@/application/use-cases/guest/request-tracking-link";
import { verifyTrackingLink } from "@/application/use-cases/guest/verify-tracking-link";
import { setOrderToken } from "@/infrastructure/web";
import {
  apiResponse,
  readApiBody,
  apiText,
} from "@/infrastructure/http/commerce-api";
export async function POST(request: Request) {
  return apiResponse(async () => {
    const b = await readApiBody(request);
    await requestTrackingLink({
      email: apiText(b, "email", 254),
      referenceCode: apiText(b, "reference", 100),
      locale: apiText(b, "locale", 2, true) === "zh" ? "zh" : "en",
    });
    return { sent: true };
  });
}
export async function PUT(request: Request) {
  return apiResponse(async () => {
    const b = await readApiBody(request);
    const proof = await verifyTrackingLink({
      recoveryToken: apiText(b, "token", 512),
    });
    await setOrderToken(proof.orderId, proof.sessionToken);
    return { orderId: proof.orderId };
  });
}
