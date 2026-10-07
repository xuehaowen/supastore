import type { NotificationProviders } from "@/application/ports/notifications";
import { isShuttingDown } from "../runtime/shutdown";
import {
  NodemailerEmailSender,
  type EmailTransportFactory,
} from "../notifications/nodemailer-email";
import { TelnyxSmsSender } from "../notifications/telnyx-sms";
import { TelnyxPhoneVerifier } from "../notifications/telnyx-phone-verifier";
import {
  notificationConfigFromEnvironment,
  notificationConfigurationFingerprint,
  NotificationConfigurationError,
  validateNotificationConfig,
  type NotificationProviderConfig,
} from "../notifications/provider-config";
export { notificationConfigFromEnvironment } from "../notifications/provider-config";
export type { NotificationProviderConfig } from "../notifications/provider-config";
// Live external SMS/verification remains disabled pending explicit authorization.
export function liveSmsAuthorized() {
  return false;
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
    email?: NodemailerEmailSender;
    sms?: TelnyxSmsSender;
    phone?: TelnyxPhoneVerifier;
  } = {};
  if (config.email)
    providers.email = new NodemailerEmailSender(
      config.email,
      dependencies.emailTransportFactory,
    );
  const authorizeSms = dependencies.authorizeSms ?? liveSmsAuthorized;
  if (authorizeSms()) {
    const telnyxDependencies = {
      authorizeSms,
      ...(dependencies.fetcher ? { fetcher: dependencies.fetcher } : {}),
    };
    if (config.sms)
      providers.sms = new TelnyxSmsSender(config.sms, telnyxDependencies);
    if (config.phone)
      providers.phone = new TelnyxPhoneVerifier(
        config.phone,
        telnyxDependencies,
      );
  }
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
  const current = notificationConfigurationFingerprint(config);
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
