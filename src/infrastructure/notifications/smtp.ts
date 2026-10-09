import { randomUUID } from "node:crypto";
import type { NotificationAdapter } from "./adapter";
import { prepareNotification } from "@/application/notifications/template-manager";
import { db } from "@/infrastructure/db";
import { getNotificationProviders } from "@/infrastructure/bootstrap/notification-providers";
import { trackInFlight } from "@/infrastructure/runtime/shutdown";

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
