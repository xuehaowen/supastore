/** Provider-neutral transport contracts. Accepted means provider acceptance, not delivery. */
export interface ProviderIdentity {
  readonly provider: string;
  readonly profile: string;
}
export type SendResult =
  | { status: "accepted"; providerMessageId: string }
  | {
      status: "rejected";
      code: string;
      retryable: boolean;
      retryAfterMs?: number;
    }
  | { status: "unknown"; code: string };
export interface TransportCapabilities {
  readonly deliveryTracking: boolean;
  /** Acceptance records a local preview, never an external submission. */
  readonly previewOnly?: boolean;
  /** Undefined means uncertain submissions must be reconciled, never blindly retried. */
  readonly idempotencyWindowMs?: number;
}
export interface EmailMessage {
  deliveryId: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}
export interface SmsMessage {
  deliveryId: string;
  to: string;
  text: string;
}
export interface EmailSender {
  readonly identity: ProviderIdentity;
  readonly capabilities: TransportCapabilities;
  send(message: EmailMessage): Promise<SendResult>;
  close?(): Promise<void> | void;
}
export interface SmsSender {
  readonly identity: ProviderIdentity;
  readonly capabilities: TransportCapabilities;
  send(message: SmsMessage): Promise<SendResult>;
  close?(): Promise<void> | void;
}
export type VerificationStartResult =
  | { status: "pending"; verificationId: string }
  | { status: "rejected"; code: string; retryable: boolean }
  | { status: "unknown"; code: string };
export type VerificationCheckResult =
  "approved" | "invalid" | "expired" | "unavailable";
export interface PhoneVerifier {
  readonly identity: ProviderIdentity;
  start(input: {
    phone: string;
    locale: "en" | "zh";
  }): Promise<VerificationStartResult>;
  check(input: {
    verificationId: string;
    code: string;
  }): Promise<VerificationCheckResult>;
}
export interface NotificationProviders {
  readonly email?: EmailSender;
  readonly sms?: SmsSender;
  readonly phone?: PhoneVerifier;
}
export interface DeliveryEvent {
  provider: string;
  profile: string;
  eventId: string;
  providerMessageId: string;
  occurredAt: Date;
  state: "sent" | "delivered" | "failed";
  code?: string;
}
export interface OptOutEvent {
  provider: string;
  profile: string;
  eventId: string;
  occurredAt: Date;
  state: "opted_out";
  phone: string;
}
export type NotificationEvent = DeliveryEvent | OptOutEvent;
