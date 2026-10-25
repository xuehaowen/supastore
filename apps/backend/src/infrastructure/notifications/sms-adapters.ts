import { telnyxSmsIdentity } from "./notification-config";
import type { SmsSender } from "@/application/ports/notifications";
import {
  createAdapter,
  type ProfiledAdapterRegistry,
} from "../adapter-registry";
import { TelnyxSmsSender, type TelnyxDependencies } from "./telnyx-sms";
import { ConsoleSmsSender, CONSOLE_SMS_IDENTITY } from "./console-sms";
import {
  required,
  validateBuiltinNotificationConfig,
  type SmsProviderConfig,
} from "./notification-config";
export const smsAdapters = Object.freeze({
  console: {
    handle: "console",
    parseEnvironment: () => ({ provider: "console" }),
    validateConfig: () => {},
    configurationFingerprint: () => CONSOLE_SMS_IDENTITY.profile,
    create: () => new ConsoleSmsSender(),
  },
  telnyx: {
    handle: "telnyx",
    parseEnvironment: (env) => ({
      provider: "telnyx",
      apiKey: required(env, "TELNYX_API_KEY"),
      from: required(env, "TELNYX_FROM"),
      messagingProfileId: required(env, "TELNYX_MESSAGING_PROFILE_ID"),
    }),
    validateConfig: (config) =>
      validateBuiltinNotificationConfig({ sms: config }),
    configurationFingerprint: (config) =>
      telnyxSmsIdentity(config.messagingProfileId, config.from).profile,
    create: (config, dependencies) => new TelnyxSmsSender(config, dependencies),
  },
} satisfies ProfiledAdapterRegistry<
  SmsProviderConfig,
  SmsSender,
  TelnyxDependencies
>);
export function createSmsAdapter(
  config: SmsProviderConfig,
  dependencies: TelnyxDependencies,
): SmsSender {
  return createAdapter<SmsProviderConfig, SmsSender, TelnyxDependencies>(
    smsAdapters,
    config,
    dependencies,
  );
}
