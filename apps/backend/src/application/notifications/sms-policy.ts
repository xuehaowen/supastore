import { notificationEvents } from "./templates";

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
export const SMS_EVENTS = Object.fromEntries(
  Object.entries(notificationEvents)
    .filter(([, definition]) => definition.sms)
    .map(([event]) => [event, true]),
);
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
