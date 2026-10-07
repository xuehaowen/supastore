import { getNotificationProviders } from "@/infrastructure/bootstrap/notification-providers";
import {
  enqueueSmsNotifications,
  processNotificationBatch,
} from "@/application/notifications/process-delivery";
import type { NotificationProviders } from "@/application/ports/notifications";
export async function processSmsBatch(
  options: {
    providers?: NotificationProviders;
    batchSize?: number;
    leaseDurationMs?: number;
  } = {},
) {
  if (process.env.DISABLE_OUTBOUND_DELIVERY === "true") return 0;
  const providers = options.providers ?? getNotificationProviders();
  if (providers.sms) await enqueueSmsNotifications();
  return processNotificationBatch("sms", { ...options, providers });
}
