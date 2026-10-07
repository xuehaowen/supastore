import type {
  PhoneVerifier,
  VerificationStartResult,
  VerificationCheckResult,
} from "@/application/ports/notifications";
import {
  telnyxPhoneIdentity,
  validPhone,
  validUuid,
  validateNotificationConfig,
  type TelnyxPhoneConfig,
} from "./provider-config";
import { httpFailure } from "./provider-errors";
import { discardTelnyxResponse, telnyxData, telnyxPost } from "./telnyx-http";
import type { TelnyxDependencies } from "./telnyx-sms";
export class TelnyxPhoneVerifier implements PhoneVerifier {
  readonly identity;
  readonly #config: TelnyxPhoneConfig;
  readonly #dependencies: TelnyxDependencies;
  constructor(
    config: TelnyxPhoneConfig,
    dependencies: TelnyxDependencies = {},
  ) {
    validateNotificationConfig({ phone: config });
    this.#config = Object.freeze({
      ...config,
      verifyProfileId: config.verifyProfileId.toLowerCase(),
      ...(config.verifyProfileIdZh
        ? { verifyProfileIdZh: config.verifyProfileIdZh.toLowerCase() }
        : {}),
    });
    this.#dependencies = Object.freeze({ ...dependencies });
    this.identity = telnyxPhoneIdentity(
      config.verifyProfileId,
      config.verifyProfileIdZh,
    );
  }
  async start(input: {
    phone: string;
    locale: "en" | "zh";
  }): Promise<VerificationStartResult> {
    if (!this.#dependencies.authorizeSms?.())
      return {
        status: "rejected",
        code: "PHONE_VERIFICATION_DISABLED",
        retryable: false,
      };
    if (!validPhone(input.phone) || !["en", "zh"].includes(input.locale))
      return { status: "rejected", code: "PHONE_INVALID", retryable: false };
    // Language/templates are configured on Verify profiles, not undocumented request fields.
    const profile =
      input.locale === "zh"
        ? (this.#config.verifyProfileIdZh ?? this.#config.verifyProfileId)
        : this.#config.verifyProfileId;
    try {
      const response = await telnyxPost(
        "/v2/verifications/sms",
        this.#config.apiKey,
        { phone_number: input.phone, verify_profile_id: profile },
        this.#dependencies.fetcher,
      );
      if (!response.ok) {
        const result = httpFailure(response);
        await discardTelnyxResponse(response);
        return result.status === "rejected"
          ? {
              status: "rejected",
              code: result.code,
              retryable: result.retryable,
            }
          : result;
      }
      const data = await telnyxData(response);
      if (
        !data ||
        typeof data.id !== "string" ||
        !validUuid(data.id) ||
        data.status !== "pending" ||
        (data.verify_profile_id !== undefined &&
          data.verify_profile_id !== profile)
      )
        return { status: "unknown", code: "TELNYX_VERIFICATION_UNKNOWN" };
      return { status: "pending", verificationId: data.id };
    } catch {
      return { status: "unknown", code: "TELNYX_VERIFICATION_UNKNOWN" };
    }
  }
  async check(input: {
    verificationId: string;
    code: string;
  }): Promise<VerificationCheckResult> {
    if (!this.#dependencies.authorizeSms?.()) return "unavailable";
    if (!validUuid(input.verificationId) || !/^\d{4,10}$/.test(input.code))
      return "invalid";
    try {
      const response = await telnyxPost(
        `/v2/verifications/${input.verificationId}/actions/verify`,
        this.#config.apiKey,
        { code: input.code },
        this.#dependencies.fetcher,
      );
      if (!response.ok) {
        await discardTelnyxResponse(response);
        return response.status === 404 ? "expired" : "unavailable";
      }
      const data = await telnyxData(response);
      switch (data?.response_code) {
        case "accepted":
          return "approved";
        case "rejected":
          return "invalid";
        case "expired":
        case "max_attempts_exceeded":
          return "expired";
        default:
          return "unavailable";
      }
    } catch {
      return "unavailable";
    }
  }
}
