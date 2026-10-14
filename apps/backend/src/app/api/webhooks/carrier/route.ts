import { createHash } from "node:crypto";
import { validCarrierSignature } from "@/domain/carrier-webhook";
import { applyCarrierDelivery } from "@/application/use-cases/fulfillment/shipments";
import { apiResponse } from "@/infrastructure/http/commerce-api";
import {
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";
import { DomainError } from "@/application/common/errors";
export async function POST(request: Request) {
  const provider = process.env.CARRIER_WEBHOOK_PROVIDER,
    secret = process.env.CARRIER_WEBHOOK_SECRET;
  if (!provider || !secret)
    return Response.json(
      { error: "Carrier callbacks are disabled." },
      { status: 503 },
    );
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  let bytes = 0,
    raw = "";
  const decoder = new TextDecoder();
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 16384) {
      await reader.cancel();
      return new Response(null, { status: 413 });
    }
    raw += decoder.decode(chunk.value, { stream: true });
  }
  raw += decoder.decode();
  if (
    !validCarrierSignature(
      raw,
      request.headers.get("x-carrier-timestamp") || "",
      request.headers.get("x-carrier-signature") || "",
      secret,
    )
  )
    return Response.json(
      { error: "Invalid carrier signature." },
      { status: 401 },
    );
  return apiResponse(async () => {
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (body.status !== "delivered")
      throw new DomainError("Unsupported carrier event status.");
    return applyCarrierDelivery({
      provider,
      eventId: parseActionRequiredText(body.eventId, "Carrier event", 200),
      shipmentId: parseActionUuid(body.shipmentId, "Shipment"),
      bodyHash: createHash("sha256").update(raw).digest("hex"),
    });
  });
}
