import { randomUUID } from "node:crypto";
import type { NotificationAdapter } from "./adapter";
import { renderEmail } from "@/application/notifications/render-message";
import { getNotificationProviders } from "@/infrastructure/bootstrap/notification-providers";
import { trackInFlight } from "@/infrastructure/runtime/shutdown";

/** Compatibility for existing authentication hooks. Acceptance is not delivery proof. */
export const smtpAdapter: NotificationAdapter = {
  async sendEmail(payload) {
    const sender = getNotificationProviders().email;
    if (!sender)
      return { success: false, error: "Email delivery is disabled." };
    const result = await trackInFlight(() =>
      sender.send(renderEmail({ ...payload, deliveryId: randomUUID() })),
    );
    return result.status === "accepted"
      ? { success: true, messageId: result.providerMessageId }
      : { success: false, error: result.code };
  },
};
