import type {
  EmailSender,
  EmailMessage,
  SmsSender,
  SmsMessage,
  PhoneVerifier,
  VerificationStartResult,
  VerificationCheckResult,
  SendResult,
} from "@/application/ports/notifications";
import { identity } from "./provider-config";
import { randomUUID } from "node:crypto";
/** Explicit test dependencies only. Production bootstrap never selects these. */
export class FakeEmailSender implements EmailSender {
  readonly identity = identity("fake-email", { test: true });
  readonly capabilities = Object.freeze({ deliveryTracking: false });
  readonly messages: EmailMessage[] = [];
  constructor(private readonly result?: SendResult) {}
  async send(message: EmailMessage): Promise<SendResult> {
    this.messages.push({ ...message });
    return (
      this.result ?? {
        status: "accepted",
        providerMessageId: `fake-email:${message.deliveryId}`,
      }
    );
  }
}
export class FakeSmsSender implements SmsSender {
  readonly identity = identity("fake-sms", { test: true });
  readonly capabilities = Object.freeze({ deliveryTracking: true });
  readonly messages: SmsMessage[] = [];
  constructor(private readonly result?: SendResult) {}
  async send(message: SmsMessage): Promise<SendResult> {
    this.messages.push({ ...message });
    return (
      this.result ?? {
        status: "accepted",
        providerMessageId: `fake-sms:${message.deliveryId}`,
      }
    );
  }
}
export class FakePhoneVerifier implements PhoneVerifier {
  readonly identity = identity("fake-phone", { test: true });
  readonly requests: { phone: string; locale: "en" | "zh" }[] = [];
  constructor(
    private readonly started?: VerificationStartResult,
    private readonly checked: VerificationCheckResult = "approved",
  ) {}
  async start(input: {
    phone: string;
    locale: "en" | "zh";
  }): Promise<VerificationStartResult> {
    this.requests.push({ ...input });
    return this.started ?? { status: "pending", verificationId: randomUUID() };
  }
  async check() {
    return this.checked;
  }
}
