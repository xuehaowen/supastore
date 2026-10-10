import type {
  SmsSender,
  SmsMessage,
  SendResult,
} from "@/application/ports/notifications";
import {
  telnyxSmsIdentity,
  validPhone,
  validUuid,
  validateBuiltinNotificationConfig as validateNotificationConfig,
  type TelnyxSmsConfig,
} from "./notification-config";
import { httpFailure } from "./provider-errors";
import { discardTelnyxResponse, telnyxData, telnyxPost } from "./telnyx-http";
export interface TelnyxDependencies {
  fetcher?: typeof fetch;
  authorizeSms?: () => boolean;
}
export class TelnyxSmsSender implements SmsSender {
  readonly identity;
  // SMS send docs do not guarantee replay protection. Email API idempotency does not apply.
  readonly capabilities = Object.freeze({ deliveryTracking: true });
  readonly #config: TelnyxSmsConfig;
  readonly #dependencies: TelnyxDependencies;
  constructor(config: TelnyxSmsConfig, dependencies: TelnyxDependencies = {}) {
    validateNotificationConfig({ sms: config });
    this.#config = Object.freeze({
      ...config,
      messagingProfileId: config.messagingProfileId.toLowerCase(),
    });
    this.#dependencies = Object.freeze({ ...dependencies });
    this.identity = telnyxSmsIdentity(config.messagingProfileId, config.from);
  }
  async send(message: SmsMessage): Promise<SendResult> {
    if (!this.#dependencies.authorizeSms?.())
      return { status: "rejected", code: "SMS_DISABLED", retryable: false };
    if (
      !validPhone(message.to) ||
      !/^[A-Za-z0-9._:-]{1,200}$/.test(message.deliveryId) ||
      !message.text ||
      message.text.length > 1600
    )
      return { status: "rejected", code: "SMS_INVALID", retryable: false };
    try {
      const response = await telnyxPost(
        "/v2/messages",
        this.#config.apiKey,
        {
          from: this.#config.from,
          to: message.to,
          messaging_profile_id: this.#config.messagingProfileId,
          text: message.text,
          type: "SMS",
          use_profile_webhooks: true,
        },
        this.#dependencies.fetcher,
      );
      if (!response.ok) {
        const result = httpFailure(response);
        await discardTelnyxResponse(response);
        return result;
      }
      const data = await telnyxData(response);
      if (
        !data ||
        typeof data.id !== "string" ||
        !validUuid(data.id) ||
        (data.messaging_profile_id !== undefined &&
          data.messaging_profile_id !== this.#config.messagingProfileId)
      )
        return { status: "unknown", code: "TELNYX_RESPONSE_UNKNOWN" };
      if (
        data.to !== undefined &&
        (!Array.isArray(data.to) ||
          data.to.length !== 1 ||
          data.to[0]?.phone_number !== message.to)
      )
        return { status: "unknown", code: "TELNYX_RESPONSE_UNKNOWN" };
      if (
        data.from !== undefined &&
        (!data.from ||
          typeof data.from !== "object" ||
          (data.from as { phone_number?: unknown }).phone_number !==
            this.#config.from)
      )
        return { status: "unknown", code: "TELNYX_RESPONSE_UNKNOWN" };
      return { status: "accepted", providerMessageId: data.id };
    } catch {
      return { status: "unknown", code: "TELNYX_SUBMISSION_UNKNOWN" };
    }
  }
}
