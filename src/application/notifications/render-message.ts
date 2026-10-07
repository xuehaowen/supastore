import type { EmailMessage } from "@/application/ports/notifications";

export interface EmailTemplateInput {
  deliveryId: string;
  recipient: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

/** Content policy lives here; transports receive only prepared content. */
export function renderEmail(input: EmailTemplateInput): EmailMessage {
  const lines = [input.subject];
  if (typeof input.data.message === "string") lines.push(input.data.message);
  for (const key of [
    "referenceCode",
    "purchaseTotalCents",
    "receivedCents",
    "balanceCents",
    "recoveryUrl",
    "verificationUrl",
    "resetUrl",
  ] as const) {
    const value = input.data[key];
    if (
      typeof value === "string" ||
      (typeof value === "number" && Number.isFinite(value))
    )
      lines.push(`${key}: ${value}`);
  }
  return {
    deliveryId: input.deliveryId,
    to: input.recipient,
    subject: input.subject,
    text: lines.join("\n"),
  };
}

export function renderOrderEmail(
  deliveryId: string,
  recipient: string,
  eventType: string,
  payload: Record<string, unknown>,
): EmailMessage {
  const reference =
    typeof payload.referenceCode === "string"
      ? payload.referenceCode
      : "your order";
  return renderEmail({
    deliveryId,
    recipient,
    template: eventType,
    data: payload,
    subject: eventType.startsWith("return.")
      ? `Product return update · ${reference}`
      : `Notification: ${eventType}`,
  });
}
