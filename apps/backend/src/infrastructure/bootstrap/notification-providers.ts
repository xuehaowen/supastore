import type {
  NotificationProviders,
  EmailSender,
  SmsSender,
  PhoneVerifier,
} from "@/application/ports/notifications";
import { isShuttingDown } from "../runtime/shutdown";
import { type EmailTransportFactory } from "../notifications/nodemailer-email";
import { createSmsAdapter } from "../notifications/sms-adapters";
import { createEmailAdapter } from "../notifications/email-adapters";
import { createPhoneAdapter } from "../notifications/phone-adapters";
import {
  notificationConfigFromEnvironment,
  notificationConfigurationFingerprint,
  NotificationConfigurationError,
  validateNotificationConfig,
  type NotificationProviderConfig,
} from "../notifications/provider-config";
export { notificationConfigFromEnvironment } from "../notifications/provider-config";
export type { NotificationProviderConfig } from "../notifications/provider-config";
// Deployment operators explicitly authorize external SMS/verification; default off.
export function liveSmsAuthorized() {
  return (
    process.env.SMS_LIVE_AUTHORIZED === "true" &&
    process.env.DISABLE_OUTBOUND_DELIVERY !== "true"
  );
}
export function smsEnrollmentAvailable() {
  if (!liveSmsAuthorized()) return false;
  const providers = getNotificationProviders();
  return Boolean(
    providers.sms && !providers.sms.capabilities.previewOnly && providers.phone,
  );
}
export interface NotificationProviderDependencies {
  emailTransportFactory?: EmailTransportFactory;
  fetcher?: typeof fetch;
  authorizeSms?: () => boolean;
}
export function createNotificationProviders(
  config: NotificationProviderConfig = notificationConfigFromEnvironment(),
  dependencies: NotificationProviderDependencies = {},
): NotificationProviders {
  validateNotificationConfig(config);
  const providers: {
    email?: EmailSender;
    sms?: SmsSender;
    phone?: PhoneVerifier;
  } = {};
  if (config.email)
    providers.email = createEmailAdapter(
      config.email,
      dependencies.emailTransportFactory,
    );
  const authorizeSms = dependencies.authorizeSms ?? liveSmsAuthorized;
  const liveAuthorized = authorizeSms();
  const telnyxDependencies = {
    authorizeSms,
    ...(dependencies.fetcher ? { fetcher: dependencies.fetcher } : {}),
  };
  if (config.sms && (config.sms.provider === "console" || liveAuthorized))
    providers.sms = createSmsAdapter(config.sms, telnyxDependencies);
  if (config.phone && liveAuthorized)
    providers.phone = createPhoneAdapter(config.phone, telnyxDependencies);
  return Object.freeze(providers);
}
type ProviderState = {
  singleton: NotificationProviders | undefined;
  fingerprint: string | undefined;
};
const processGlobal = globalThis as typeof globalThis & {
  __supastoreNotificationProviders?: ProviderState;
};
const state = (processGlobal.__supastoreNotificationProviders ??= {
  singleton: undefined,
  fingerprint: undefined,
});
export function getNotificationProviders(): NotificationProviders {
  if (process.env.DISABLE_OUTBOUND_DELIVERY === "true" || isShuttingDown())
    return Object.freeze({});
  const config = notificationConfigFromEnvironment();
  const current =
    notificationConfigurationFingerprint(config) + ":" + liveSmsAuthorized();
  if (state.singleton && state.fingerprint !== current)
    throw new NotificationConfigurationError(
      "provider profile changed; restart required",
    );
  if (!state.singleton) {
    state.singleton = createNotificationProviders(config);
    state.fingerprint = current;
  }
  return state.singleton;
}
export async function closeNotificationProviders() {
  const old = state.singleton;
  state.singleton = undefined;
  state.fingerprint = undefined;
  await Promise.all([old?.email?.close?.(), old?.sms?.close?.()]);
}
