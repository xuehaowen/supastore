import { identity } from "./notification-config";
export * from "./notification-config";
import type {
  EmailSender,
  SmsSender,
  PhoneVerifier,
} from "@/application/ports/notifications";
import {
  adapterDefinition,
  adapterFingerprint,
  type AdapterEnvironment,
} from "../adapter-registry";
import { emailAdapters } from "./email-adapters";
import { smsAdapters } from "./sms-adapters";
import { phoneAdapters } from "./phone-adapters";
import type { EmailTransportFactory } from "./nodemailer-email";
import type { TelnyxDependencies } from "./telnyx-sms";
import type {
  NotificationProviderConfig,
  EmailProviderConfig,
  SmsProviderConfig,
  PhoneProviderConfig,
} from "./notification-config";
export function validateNotificationConfig(config: NotificationProviderConfig) {
  if (config.email)
    adapterDefinition<
      EmailProviderConfig,
      EmailSender,
      EmailTransportFactory | undefined
    >(emailAdapters, config.email.provider, "EMAIL_PROVIDER").validateConfig(
      config.email,
    );
  if (config.sms)
    adapterDefinition<SmsProviderConfig, SmsSender, TelnyxDependencies>(
      smsAdapters,
      config.sms.provider,
      "SMS_PROVIDER",
    ).validateConfig(config.sms);
  if (config.phone)
    adapterDefinition<PhoneProviderConfig, PhoneVerifier, TelnyxDependencies>(
      phoneAdapters,
      config.phone.provider,
      "PHONE_VERIFICATION_PROVIDER",
    ).validateConfig(config.phone);
}
export function notificationConfigFromEnvironment(
  env: AdapterEnvironment = process.env,
): NotificationProviderConfig {
  const config: NotificationProviderConfig = {};
  const email =
    env.EMAIL_PROVIDER ?? (env.SMTP_HOST ? "nodemailer" : "disabled");
  const sms = env.SMS_PROVIDER ?? "disabled";
  const phone = env.PHONE_VERIFICATION_PROVIDER ?? "disabled";
  if (email !== "disabled")
    config.email = adapterDefinition<
      EmailProviderConfig,
      EmailSender,
      EmailTransportFactory | undefined
    >(emailAdapters, email, "EMAIL_PROVIDER").parseEnvironment(env);
  if (sms !== "disabled")
    config.sms = adapterDefinition<
      SmsProviderConfig,
      SmsSender,
      TelnyxDependencies
    >(smsAdapters, sms, "SMS_PROVIDER").parseEnvironment(env);
  if (phone !== "disabled")
    config.phone = adapterDefinition<
      PhoneProviderConfig,
      PhoneVerifier,
      TelnyxDependencies
    >(phoneAdapters, phone, "PHONE_VERIFICATION_PROVIDER").parseEnvironment(
      env,
    );
  validateNotificationConfig(config);
  return config;
}

export function notificationConfigurationFingerprint(
  config: NotificationProviderConfig,
) {
  return identity("notifications", {
    email: config.email
      ? adapterFingerprint<
          EmailProviderConfig,
          EmailSender,
          EmailTransportFactory | undefined
        >(emailAdapters, config.email)
      : null,
    sms: config.sms
      ? adapterFingerprint<SmsProviderConfig, SmsSender, TelnyxDependencies>(
          smsAdapters,
          config.sms,
        )
      : null,
    phone: config.phone
      ? adapterFingerprint<
          PhoneProviderConfig,
          PhoneVerifier,
          TelnyxDependencies
        >(phoneAdapters, config.phone)
      : null,
  }).profile;
}
