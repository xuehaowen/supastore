import { createHash } from "node:crypto";
import type { ProviderIdentity } from "@/application/ports/notifications";

export class NotificationConfigurationError extends Error {
  constructor(field: string) {
    super(`Invalid notification configuration: ${field}.`);
    this.name = "NotificationConfigurationError";
  }
}
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
export interface NotificationProviderConfig {
  email?: NodemailerConfig;
  sms?: TelnyxSmsConfig;
  phone?: TelnyxPhoneConfig;
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
export function nodemailerIdentity(config: NodemailerConfig) {
  return identity("nodemailer", {
    host: config.host,
    port: config.port,
    secure: config.secure,
    from: config.from,
    user: config.user ?? null,
  });
}
export function smtpRequiresTls(config: NodemailerConfig) {
  return (
    config.requireTls ??
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(
      config.host.toLowerCase(),
    )
  );
}
export function validateNotificationConfig(config: NotificationProviderConfig) {
  const email = config.email;
  if (email) {
    if (email.provider !== "nodemailer")
      throw new NotificationConfigurationError("EMAIL_PROVIDER");
    if (!/^[A-Za-z0-9.:[\]-]{1,253}$/.test(email.host))
      throw new NotificationConfigurationError("SMTP_HOST");
    if (!Number.isInteger(email.port) || email.port < 1 || email.port > 65535)
      throw new NotificationConfigurationError("SMTP_PORT");
    if (typeof email.secure !== "boolean")
      throw new NotificationConfigurationError("SMTP_SECURE");
    if (email.requireTls !== undefined && typeof email.requireTls !== "boolean")
      throw new NotificationConfigurationError("SMTP_REQUIRE_TLS");
    if (
      email.from.length > 400 ||
      /[\x00-\x1f\x7f]/.test(email.from) ||
      !validMailbox(mailbox(email.from))
    )
      throw new NotificationConfigurationError("SMTP_FROM");
    if (
      (email.user && !email.password) ||
      (!email.user && email.password) ||
      email.user?.includes("\n") ||
      email.user?.includes("\r")
    )
      throw new NotificationConfigurationError("SMTP_AUTH");
  }
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
function required(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
) {
  const value = env[name];
  if (!value) throw new NotificationConfigurationError(name);
  return value;
}
export function notificationConfigFromEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): NotificationProviderConfig {
  const emailProvider =
    env.EMAIL_PROVIDER ?? (env.SMTP_HOST ? "nodemailer" : "disabled");
  const smsProvider = env.SMS_PROVIDER ?? "disabled";
  const phoneProvider = env.PHONE_VERIFICATION_PROVIDER ?? "disabled";
  if (!["disabled", "nodemailer"].includes(emailProvider))
    throw new NotificationConfigurationError("EMAIL_PROVIDER");
  if (!["disabled", "telnyx"].includes(smsProvider))
    throw new NotificationConfigurationError("SMS_PROVIDER");
  if (!["disabled", "telnyx"].includes(phoneProvider))
    throw new NotificationConfigurationError("PHONE_VERIFICATION_PROVIDER");
  const config: NotificationProviderConfig = {};
  if (emailProvider === "nodemailer") {
    const port = Number(env.SMTP_PORT ?? 587);
    if (
      env.SMTP_SECURE !== undefined &&
      !["true", "false"].includes(env.SMTP_SECURE)
    )
      throw new NotificationConfigurationError("SMTP_SECURE");
    if (
      env.SMTP_REQUIRE_TLS !== undefined &&
      !["true", "false"].includes(env.SMTP_REQUIRE_TLS)
    )
      throw new NotificationConfigurationError("SMTP_REQUIRE_TLS");
    config.email = {
      provider: "nodemailer",
      host: required(env, "SMTP_HOST"),
      port,
      secure:
        env.SMTP_SECURE === undefined
          ? port === 465
          : env.SMTP_SECURE === "true",
      from: required(env, "SMTP_FROM"),
      ...(env.SMTP_REQUIRE_TLS === undefined
        ? {}
        : { requireTls: env.SMTP_REQUIRE_TLS === "true" }),
      ...(env.SMTP_USER ? { user: env.SMTP_USER } : {}),
      ...(env.SMTP_PASSWORD ? { password: env.SMTP_PASSWORD } : {}),
    };
  }
  if (smsProvider === "telnyx")
    config.sms = {
      provider: "telnyx",
      apiKey: required(env, "TELNYX_API_KEY"),
      from: required(env, "TELNYX_FROM"),
      messagingProfileId: required(env, "TELNYX_MESSAGING_PROFILE_ID"),
    };
  if (phoneProvider === "telnyx")
    config.phone = {
      provider: "telnyx",
      apiKey: required(env, "TELNYX_API_KEY"),
      verifyProfileId: required(env, "TELNYX_VERIFY_PROFILE_ID"),
      ...(env.TELNYX_VERIFY_PROFILE_ID_ZH
        ? { verifyProfileIdZh: env.TELNYX_VERIFY_PROFILE_ID_ZH }
        : {}),
    };
  validateNotificationConfig(config);
  return config;
}
export function notificationConfigurationFingerprint(
  config: NotificationProviderConfig,
) {
  return identity("notifications", {
    email: config.email ? nodemailerIdentity(config.email) : null,
    emailRequireTls: config.email ? smtpRequiresTls(config.email) : null,
    sms: config.sms
      ? telnyxSmsIdentity(config.sms.messagingProfileId, config.sms.from)
      : null,
    phone: config.phone
      ? telnyxPhoneIdentity(
          config.phone.verifyProfileId,
          config.phone.verifyProfileIdZh,
        )
      : null,
  }).profile;
}
