import { randomUUID } from "node:crypto";
import type { NotificationAdapter } from "./adapter";
import { prepareNotification } from "@/application/notifications/template-manager";
import { db } from "@/infrastructure/db";
import { getNotificationProviders } from "@/infrastructure/bootstrap/notification-providers";
import { trackInFlight } from "@/infrastructure/runtime/shutdown";
import { outboxEvents, eventDeliveries } from "@/infrastructure/db/schema";
import type { EmailNotificationPayload } from "./adapter";
import { DomainError } from "@/application/common/errors";

/** Auth links expire after one hour; stop dispatching after 15 minutes of queue delay. */
export async function queueAuthEmail(
  payload: EmailNotificationPayload,
): Promise<{ success: true; messageId: string }> {
  if (
    !["auth.email_verification", "auth.reset_password"].includes(
      payload.template,
    )
  )
    throw new DomainError("Unsupported authentication email.");
  const id = randomUUID(),
    eventId = randomUUID();
  const linkKey =
    payload.template === "auth.reset_password" ? "resetUrl" : "verificationUrl";
  const link = payload.data[linkKey];
  if (typeof link !== "string")
    throw new DomainError("Authentication link required.");
  const url = new URL(link);
  const callback = url.searchParams.get("callbackURL");
  const chinese =
    payload.data.locale === "zh" ||
    /^\/zh(?:\/|$)/.test(url.pathname) ||
    Boolean(callback && /^\/zh(?:\/|$)/.test(new URL(callback, url).pathname));
  // Raw tokens are never duplicated in the payload or diagnostics.
  await db.transaction(async (tx) => {
    await tx.insert(outboxEvents).values({
      id: eventId,
      eventType: payload.template,
      aggregateType: "auth",
      aggregateId: eventId,
      payload: { [linkKey]: link, ...(chinese ? { locale: "zh" } : {}) },
    });
    await tx.insert(eventDeliveries).values({
      id,
      eventId,
      recipient: payload.recipient,
      channel: "email",
      expiresAt: new Date(Date.now() + 15 * 60000),
    });
  });
  return { success: true as const, messageId: id };
}

/** Compatibility for existing authentication hooks. Acceptance is not delivery proof. */
export const smtpAdapter: NotificationAdapter = {
  async sendEmail(payload) {
    const sender = getNotificationProviders().email;
    if (!sender)
      return { success: false, error: "Email delivery is disabled." };
    let locale: "en" | "zh" = payload.data.locale === "zh" ? "zh" : "en";
    const link = payload.data.resetUrl || payload.data.verificationUrl;
    if (typeof link === "string") {
      const url = new URL(link);
      const callback = url.searchParams.get("callbackURL");
      if (
        /\/(zh)(?:\/|$)/.test(url.pathname) ||
        (callback && /\/zh(?:\/|$)/.test(new URL(callback, url).pathname))
      )
        locale = "zh";
    }
    const prepared = await db.transaction((tx) =>
      prepareNotification(tx, {
        event: payload.template,
        channel: "email",
        audience: "customer",
        locale,
        deliveryId: randomUUID(),
        recipient: payload.recipient,
        payload: payload.data,
      }),
    );
    if (!("subject" in prepared.message))
      throw new Error("Email template required.");
    const message = prepared.message;
    const result = await trackInFlight(() => sender.send(message));
    return result.status === "accepted"
      ? { success: true, messageId: result.providerMessageId }
      : { success: false, error: result.code };
  },
};
