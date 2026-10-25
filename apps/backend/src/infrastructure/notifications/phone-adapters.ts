import { telnyxPhoneIdentity } from "./notification-config";
import type { PhoneVerifier } from "@/application/ports/notifications";
import {
  createAdapter,
  type ProfiledAdapterRegistry,
} from "../adapter-registry";
import { TelnyxPhoneVerifier } from "./telnyx-phone-verifier";
import type { TelnyxDependencies } from "./telnyx-sms";
import {
  required,
  validateBuiltinNotificationConfig,
  type PhoneProviderConfig,
} from "./notification-config";
export const phoneAdapters = Object.freeze({
  telnyx: {
    handle: "telnyx",
    parseEnvironment: (env) => ({
      provider: "telnyx",
      apiKey: required(env, "TELNYX_API_KEY"),
      verifyProfileId: required(env, "TELNYX_VERIFY_PROFILE_ID"),
      ...(env.TELNYX_VERIFY_PROFILE_ID_ZH
        ? { verifyProfileIdZh: env.TELNYX_VERIFY_PROFILE_ID_ZH }
        : {}),
    }),
    validateConfig: (config) =>
      validateBuiltinNotificationConfig({ phone: config }),
    configurationFingerprint: (config) =>
      telnyxPhoneIdentity(config.verifyProfileId, config.verifyProfileIdZh)
        .profile,
    create: (config, dependencies) =>
      new TelnyxPhoneVerifier(config, dependencies),
  },
} satisfies ProfiledAdapterRegistry<
  PhoneProviderConfig,
  PhoneVerifier,
  TelnyxDependencies
>);
export function createPhoneAdapter(
  config: PhoneProviderConfig,
  dependencies: TelnyxDependencies,
): PhoneVerifier {
  return createAdapter<PhoneProviderConfig, PhoneVerifier, TelnyxDependencies>(
    phoneAdapters,
    config,
    dependencies,
  );
}
