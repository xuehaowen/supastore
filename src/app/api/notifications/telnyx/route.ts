import {
  verifyTelnyxSignature,
  normalizeTelnyxEvent,
  telnyxEventEnvelope,
} from "@/infrastructure/webhooks/telnyx";
import { telnyxSmsIdentity } from "@/infrastructure/notifications/provider-config";
import {
  persistNotificationEvent,
  persistUnmatchedNotificationEvent,
} from "@/application/notifications/notification-inbox";
export async function POST(request: Request) {
  const key = process.env.TELNYX_PUBLIC_KEY;
  if (!key)
    return Response.json(
      { error: "Telnyx callbacks are not configured." },
      { status: 503 },
    );
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let count = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    count += chunk.value.byteLength;
    if (count > 16384) {
      await reader.cancel();
      return new Response(null, { status: 413 });
    }
    chunks.push(chunk.value);
  }
  const raw = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.length;
  }
  if (
    !verifyTelnyxSignature(
      raw,
      request.headers.get("telnyx-timestamp") || "",
      request.headers.get("telnyx-signature-ed25519") || "",
      key,
    )
  )
    return Response.json(
      { error: "Invalid webhook signature." },
      { status: 401 },
    );
  let body: string,
    event: ReturnType<typeof normalizeTelnyxEvent>,
    envelope: ReturnType<typeof telnyxEventEnvelope>;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    envelope = telnyxEventEnvelope(body);
    event = normalizeTelnyxEvent(body);
  } catch {
    return Response.json(
      { error: "Invalid webhook envelope." },
      { status: 400 },
    );
  }
  try {
    if (event) await persistNotificationEvent(event, body);
    else {
      const payload = envelope.payload;
      const incoming = envelope.eventType === "message.received";
      const merchant = incoming
        ? Array.isArray(payload.to)
          ? payload.to[0]
          : payload.to
        : payload.from;
      const merchantNumber =
        merchant && typeof merchant === "object" && "phone_number" in merchant
          ? String(merchant.phone_number)
          : "";
      const identity =
        typeof payload.messaging_profile_id === "string" && merchantNumber
          ? telnyxSmsIdentity(payload.messaging_profile_id, merchantNumber)
          : { provider: "telnyx", profile: "unmatched" };
      await persistUnmatchedNotificationEvent(
        {
          ...identity,
          eventId: envelope.eventId,
          occurredAt: envelope.occurredAt,
        },
        body,
      );
    }
    return Response.json({ accepted: true });
  } catch {
    return Response.json(
      { error: "Webhook persistence unavailable. Retry later." },
      { status: 503 },
    );
  }
}
