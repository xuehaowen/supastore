import { createHash } from "node:crypto";
import type { ProviderIdentity } from "@/application/ports/notifications";
import { validateSmtpConfig } from "./smtp-settings.mjs";
export {
  NotificationConfigurationError,
  emailAuthentication,
  smtpRequiresTls,
} from "./smtp-settings.mjs";
import {
  NotificationConfigurationError,
  smtpRequiresTls,
} from "./smtp-settings.mjs";

export interface NodemailerConfig {
  provider: "nodemailer";
  host: string;
  port: number;
  secure: boolean;
  from: string;
  user?: string;
  password?: string;
  requireTls?: boolean;
}
export interface OAuthEmailConfig extends Omit<
  NodemailerConfig,
  "provider" | "user" | "password"
> {
  provider: "nodemailer-oauth2";
  user: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}
export type SmtpProviderConfig = NodemailerConfig | OAuthEmailConfig;
export type EmailProviderConfig = SmtpProviderConfig;
function emailStrategy<Result>(
  config: SmtpProviderConfig,
  strategies: {
    [Handle in SmtpProviderConfig["provider"]]: (
      config: Extract<SmtpProviderConfig, { provider: Handle }>,
    ) => Result;
  },
): Result {
  // Each strategy is checked against its handle's config; union indexing loses
  // that correlation, so keep the dispatch assertion at this single boundary.
  const strategy = strategies[config.provider] as (
    config: SmtpProviderConfig,
  ) => Result;
  return strategy(config);
}
export interface TelnyxSmsConfig {
  provider: "telnyx";
  apiKey: string;
  from: string;
  messagingProfileId: string;
}
export interface TelnyxPhoneConfig {
  provider: "telnyx";
  apiKey: string;
  verifyProfileId: string;
  verifyProfileIdZh?: string;
}
export type SmsProviderConfig = TelnyxSmsConfig;
export type PhoneProviderConfig = TelnyxPhoneConfig;
export interface NotificationProviderConfig {
  email?: EmailProviderConfig;
  sms?: SmsProviderConfig;
  phone?: PhoneProviderConfig;
}
export function validPhone(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value);
}
export function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
export function validMailbox(value: string) {
  return (
    value.length <= 254 &&
    !/[\x00-\x1f\x7f]/.test(value) &&
    /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value)
  );
}
export function mailbox(value: string) {
  const match = /^([^<>\r\n]{1,100})<([^<>]+)>$/.exec(value);
  return match ? match[2]!.trim() : value;
}
export function identity(
  provider: string,
  fields: Record<string, unknown>,
): ProviderIdentity {
  return Object.freeze({
    provider,
    profile: createHash("sha256").update(JSON.stringify(fields)).digest("hex"),
  });
}
export function telnyxSmsIdentity(
  messagingProfileId: string,
  fromNumber: string,
) {
  return identity("telnyx", {
    provider: "telnyx",
    messagingProfileId: messagingProfileId.toLowerCase(),
    fromNumber,
  });
}
export function telnyxPhoneIdentity(
  verifyProfileId: string,
  verifyProfileIdZh?: string,
) {
  return identity("telnyx-verify", {
    provider: "telnyx-verify",
    verifyProfileId: verifyProfileId.toLowerCase(),
    verifyProfileIdZh: verifyProfileIdZh?.toLowerCase() ?? null,
  });
}
export function nodemailerIdentity(config: SmtpProviderConfig) {
  return identity(config.provider, {
    host: config.host,
    port: config.port,
    secure: config.secure,
    from: config.from,
    user: config.user ?? null,
    ...emailStrategy<Record<string, string>>(config, {
      nodemailer: () => ({}),
      "nodemailer-oauth2": (oauth) => ({ clientId: oauth.clientId }),
    }),
  });
}
export function validateBuiltinNotificationConfig(config: {
  email?: SmtpProviderConfig;
  sms?: TelnyxSmsConfig;
  phone?: TelnyxPhoneConfig;
}) {
  const email = config.email;
  if (email) validateSmtpConfig(email);
  for (const channel of [config.sms, config.phone]) {
    if (
      channel &&
      (channel.provider !== "telnyx" ||
        !channel.apiKey ||
        channel.apiKey.length > 4096 ||
        !/^[\x21-\x7e]+$/.test(channel.apiKey))
    )
      throw new NotificationConfigurationError("TELNYX_API_KEY");
  }
  if (config.sms) {
    if (!validPhone(config.sms.from))
      throw new NotificationConfigurationError("TELNYX_FROM");
    if (!validUuid(config.sms.messagingProfileId))
      throw new NotificationConfigurationError("TELNYX_MESSAGING_PROFILE_ID");
  }
  if (config.phone) {
    if (!validUuid(config.phone.verifyProfileId))
      throw new NotificationConfigurationError("TELNYX_VERIFY_PROFILE_ID");
    if (
      config.phone.verifyProfileIdZh &&
      !validUuid(config.phone.verifyProfileIdZh)
    )
      throw new NotificationConfigurationError("TELNYX_VERIFY_PROFILE_ID_ZH");
  }
}
export function required(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
) {
  const value = env[name];
  if (!value) throw new NotificationConfigurationError(name);
  return value;
}
