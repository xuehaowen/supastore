import { getNotificationProviders } from "@/infrastructure/bootstrap/notification-providers";
import { processNotificationBatch } from "@/application/notifications/process-delivery";
import type { NotificationProviders } from "@/application/ports/notifications";
export {
  RETRY_DELAYS_MS,
  MAX_DELIVERY_ATTEMPTS,
  getNextRetryInfo,
} from "@/application/notifications/delivery-policy";
export interface ProcessOutboxOptions {
  providers?: NotificationProviders;
  batchSize?: number;
  leaseDurationMs?: number;
}
export async function processOutboxBatch(options: ProcessOutboxOptions = {}) {
  if (process.env.DISABLE_OUTBOUND_DELIVERY === "true") return 0;
  return processNotificationBatch("email", {
    ...options,
    providers: options.providers ?? getNotificationProviders(),
  });
}
