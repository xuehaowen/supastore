import { createPublicKey, verify } from "node:crypto";
import type { NotificationEvent } from "@/application/ports/notifications";
import { validSmsPhone } from "@/application/notifications/sms-policy";
import { telnyxSmsIdentity } from "@/infrastructure/notifications/provider-config";
// Telnyx signs timestamp|unaltered payload with Ed25519; official Node SDK:
// https://github.com/team-telnyx/telnyx-node/blob/master/src/lib/webhooks.ts
export function verifyTelnyxSignature(
  raw: Uint8Array,
  timestamp: string,
  signature: string,
  publicKey: string,
  now = Date.now(),
) {
  if (
    !publicKey ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now - Number(timestamp) * 1000) > 300000 ||
    !/^[A-Za-z0-9+/]{86}==$/.test(signature) ||
    !/^[A-Za-z0-9+/]{43}=$/.test(publicKey)
  )
    return false;
  try {
    const keyBytes = Buffer.from(publicKey, "base64"),
      signatureBytes = Buffer.from(signature, "base64");
    if (keyBytes.length !== 32 || signatureBytes.length !== 64) return false;
    const key = createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        keyBytes,
      ]),
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.concat([Buffer.from(timestamp + "|"), raw]),
      key,
      signatureBytes,
    );
  } catch {
    return false;
  }
}
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const text = (value: unknown, max = 200) =>
  typeof value === "string" && value.length > 0 && value.length <= max
    ? value
    : null;
export function telnyxEventEnvelope(raw: string) {
  const root = record(JSON.parse(raw)),
    data = record(root?.data),
    payload = record(data?.payload);
  const eventId = text(data?.id),
    eventType = text(data?.event_type),
    occurredAt =
      typeof data?.occurred_at === "string" ? new Date(data.occurred_at) : null;
  if (
    !data ||
    !payload ||
    !eventId ||
    !eventType ||
    !occurredAt ||
    Number.isNaN(occurredAt.getTime())
  )
    throw new Error("Invalid Telnyx webhook envelope.");
  return { eventId, eventType, occurredAt, payload };
}
export function normalizeTelnyxEvent(raw: string): NotificationEvent | null {
  const { eventId, eventType, occurredAt, payload } = telnyxEventEnvelope(raw);
  const profileId = text(payload.messaging_profile_id);
  const from = record(payload.from);
  const recipientList = Array.isArray(payload.to)
    ? payload.to.map(record)
    : [record(payload.to)];
  const incoming = eventType === "message.received";
  const sender = text(
    incoming ? recipientList[0]?.phone_number : from?.phone_number,
    20,
  );
  if (!profileId || !sender || !validSmsPhone(sender)) return null;
  const identity = telnyxSmsIdentity(profileId, sender);
  if (incoming) {
    const phone = text(from?.phone_number, 20);
    if (
      phone &&
      validSmsPhone(phone) &&
      ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(
        String(payload.text || "")
          .trim()
          .toUpperCase(),
      )
    )
      return { ...identity, eventId, occurredAt, state: "opted_out", phone };
    return null;
  }
  const providerMessageId = text(payload.id);
  if (!providerMessageId) return null;
  if (eventType === "message.sent")
    return {
      ...identity,
      eventId,
      occurredAt,
      providerMessageId,
      state: "sent",
    };
  if (eventType !== "message.finalized") return null;
  const statuses = recipientList.map((to) => to?.status);
  const errors = Array.isArray(payload.errors)
    ? payload.errors.map(record)
    : [];
  const failed = statuses.some((status) =>
    ["delivery_failed", "sending_failed", "failed", "undelivered"].includes(
      String(status),
    ),
  );
  if (failed)
    return {
      ...identity,
      eventId,
      occurredAt,
      providerMessageId,
      state: "failed",
      ...(text(errors[0]?.code) ? { code: String(errors[0]!.code) } : {}),
    };
  if (statuses.length && statuses.every((status) => status === "delivered"))
    return {
      ...identity,
      eventId,
      occurredAt,
      providerMessageId,
      state: "delivered",
    };
  return null;
}
