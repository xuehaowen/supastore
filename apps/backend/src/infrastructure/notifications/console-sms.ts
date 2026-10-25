import type {
  SmsMessage,
  SmsSender,
  SendResult,
} from "@/application/ports/notifications";
import { identity, validPhone } from "./notification-config";
import { logger } from "../security/logger";

export const CONSOLE_SMS_IDENTITY = identity("console-sms", { version: 1 });

/** Local previews never contact a messaging provider or establish delivery. */
export class ConsoleSmsSender implements SmsSender {
  readonly identity = CONSOLE_SMS_IDENTITY;
  readonly capabilities = Object.freeze({
    deliveryTracking: false,
    previewOnly: true,
  });

  async send(message: SmsMessage): Promise<SendResult> {
    if (process.env.DISABLE_OUTBOUND_DELIVERY === "true")
      return { status: "rejected", code: "SMS_DISABLED", retryable: false };
    if (!validPhone(message.to) || !message.text || message.text.length > 500)
      return { status: "rejected", code: "SMS_INVALID", retryable: false };
    logger.info("SMS console preview (live sending disabled).", {
      deliveryId: message.deliveryId,
      provider: this.identity.provider,
      recipient: `***${message.to.slice(-4)}`,
      text: message.text,
    });
    return {
      status: "accepted",
      providerMessageId: `console:${message.deliveryId}`,
    };
  }
}
