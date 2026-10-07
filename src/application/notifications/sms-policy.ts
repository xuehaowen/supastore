export function validSmsPhone(phone: string) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
export function smsQuietUntil(timezone: string, now = new Date()) {
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: timezone,
        hour: "numeric",
        hourCycle: "h23",
      }).format(now),
    );
  } catch {
    return new Date(now.getTime() + 3600000);
  }
  return hour >= 8 && hour < 20 ? null : new Date(now.getTime() + 3600000);
}
export const smsEvents: Record<string, [string, string]> = {
  "order.confirmed": ["Your order is confirmed", "您的订单已确认"],
  "order.cancelled": ["Your order was cancelled", "您的订单已取消"],
  "fulfillment.shipped": ["Your order has been dispatched", "您的订单已发出"],
  "fulfillment.out_for_delivery": [
    "Your order is out for delivery",
    "您的订单正在配送",
  ],
  "fulfillment.ready_for_pickup": [
    "Your order is ready for pickup",
    "您的订单可以取货了",
  ],
  "fulfillment.completed": ["Your order is complete", "您的订单已完成"],
  "order.completed": ["Your order is complete", "您的订单已完成"],
};
export function smsText(
  event: string,
  reference: string,
  locale: string,
  template?: string,
) {
  const message = smsEvents[event]?.[locale === "zh" ? 1 : 0];
  if (!message) throw new Error("Unsupported SMS event.");
  const content =
    template ||
    (locale === "zh"
      ? "{status} · {reference}。回复 STOP 退订。"
      : "{status} · {reference}. Reply STOP to unsubscribe.");
  return content
    .replaceAll("{status}", message)
    .replaceAll("{reference}", reference.replace(/[\r\n]/g, " ").slice(0, 60))
    .slice(0, 500);
}
export const SMS_EVENTS = smsEvents;
export function smsDeliveryAllowed(
  preference:
    | {
        phone: string;
        optedIn: boolean;
        verifiedAt: Date | null;
        consentAt: Date | null;
      }
    | null
    | undefined,
  recipient: string,
  eventCreatedAt: Date,
) {
  return Boolean(
    preference?.optedIn &&
    preference.verifiedAt &&
    preference.consentAt &&
    validSmsPhone(recipient) &&
    preference.phone === recipient &&
    eventCreatedAt.getTime() >= preference.consentAt.getTime(),
  );
}
export function renderOrderSms(
  deliveryId: string,
  recipient: string,
  eventType: string,
  payload: Record<string, unknown>,
  locale: string,
  template?: string,
): import("@/application/ports/notifications").SmsMessage {
  if (!validSmsPhone(recipient) || typeof payload.referenceCode !== "string")
    throw new Error("SMS requires a verified recipient and order reference.");
  return {
    deliveryId,
    to: recipient,
    text: smsText(eventType, payload.referenceCode, locale, template),
  };
}
