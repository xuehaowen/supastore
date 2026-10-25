import { afterEach, expect, it, vi } from "vitest";
import {
  createNotificationProviders,
  getNotificationProviders,
  closeNotificationProviders,
  smsEnrollmentAvailable,
} from "@/infrastructure/bootstrap/notification-providers";
import { deliveryOutcome } from "@/application/notifications/delivery-policy";
import { logger } from "@/infrastructure/security/logger";
import { notificationConfigFromEnvironment } from "@/infrastructure/notifications/provider-config";

afterEach(async () => {
  await closeNotificationProviders();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const message = {
  deliveryId: "console-fixture",
  to: "+12025550123",
  text: "Supastore: Order TEST123 is confirmed. Reply STOP to opt out.",
};

it("prints explicitly selected console SMS with a masked recipient and no network request", async () => {
  vi.stubEnv("DISABLE_OUTBOUND_DELIVERY", "false");
  const log = vi.spyOn(logger, "info").mockImplementation(() => {});
  const fetcher = vi.fn<typeof fetch>();
  const providers = createNotificationProviders(
    { sms: { provider: "console" } },
    { fetcher, authorizeSms: () => false },
  );
  expect(providers.sms).toBeDefined();
  const result = await providers.sms!.send(message);
  expect(result.status).toBe("accepted");
  expect(providers.sms!.identity.provider).toBe("console-sms");
  expect(log).toHaveBeenCalledWith(
    "SMS console preview (live sending disabled).",
    expect.objectContaining({
      text: message.text,
      recipient: "***0123",
      deliveryId: message.deliveryId,
    }),
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain(message.to);
  expect(fetcher).not.toHaveBeenCalled();
});

it("records console acceptance as a suppressed preview rather than a sent notification", () => {
  const now = new Date();
  expect(
    deliveryOutcome(
      { status: "accepted", providerMessageId: "console:fixture" },
      {
        attempts: 1,
        now,
        firstSubmittedAt: now,
        capabilities: { deliveryTracking: false, previewOnly: true },
      },
    ),
  ).toMatchObject({ status: "suppressed", providerStatus: "console_preview" });
});

it("does not activate phone enrollment or log anything under global suppression", async () => {
  vi.stubEnv("SMS_PROVIDER", "console");
  vi.stubEnv("EMAIL_PROVIDER", "disabled");
  vi.stubEnv("PHONE_VERIFICATION_PROVIDER", "disabled");
  vi.stubEnv("SMS_LIVE_AUTHORIZED", "false");
  vi.stubEnv("DISABLE_OUTBOUND_DELIVERY", "false");
  const log = vi.spyOn(logger, "info").mockImplementation(() => {});
  const providers = getNotificationProviders();
  expect(providers.sms).toBeDefined();
  expect(providers.phone).toBeUndefined();
  expect(smsEnrollmentAvailable()).toBe(false);
  vi.stubEnv("DISABLE_OUTBOUND_DELIVERY", "true");
  expect(getNotificationProviders()).toEqual({});
  await expect(providers.sms!.send(message)).resolves.toMatchObject({
    status: "rejected",
    code: "SMS_DISABLED",
  });
  expect(log).not.toHaveBeenCalled();
});

it("keeps disabled and unauthorized SMS silent, and uses Telnyx only when authorized", () => {
  const config = {
    sms: {
      provider: "telnyx" as const,
      apiKey: "synthetic",
      from: "+12025550999",
      messagingProfileId: "11111111-1111-4111-8111-111111111111",
    },
  };
  expect(
    createNotificationProviders(config, { authorizeSms: () => false }).sms
      ?.identity.provider,
  ).toBeUndefined();
  expect(createNotificationProviders({}).sms).toBeUndefined();
  expect(
    notificationConfigFromEnvironment({ SMS_PROVIDER: "disabled" }).sms,
  ).toBeUndefined();
  expect(
    createNotificationProviders(config, { authorizeSms: () => true }).sms
      ?.identity.provider,
  ).toBe("telnyx");
});

it("does not enable enrollment when only live verification is configured", () => {
  for (const [key, value] of Object.entries({
    SMS_PROVIDER: "console",
    EMAIL_PROVIDER: "disabled",
    SMS_LIVE_AUTHORIZED: "true",
    DISABLE_OUTBOUND_DELIVERY: "false",
    PHONE_VERIFICATION_PROVIDER: "telnyx",
    TELNYX_API_KEY: "synthetic",
    TELNYX_VERIFY_PROFILE_ID: "11111111-1111-4111-8111-111111111111",
  }))
    vi.stubEnv(key, value);
  expect(getNotificationProviders().sms?.identity.provider).toBe("console-sms");
  expect(smsEnrollmentAvailable()).toBe(false);
});

it("parses explicit console mode without provider credentials and never falls back for invalid configuration", () => {
  expect(
    notificationConfigFromEnvironment({ SMS_PROVIDER: "console" }),
  ).toEqual({ sms: { provider: "console" } });
  expect(() =>
    notificationConfigFromEnvironment({ SMS_PROVIDER: "telnyx" }),
  ).toThrow("TELNYX_API_KEY");
  expect(() =>
    notificationConfigFromEnvironment({ SMS_PROVIDER: "invalid" }),
  ).toThrow("SMS_PROVIDER");
});

it("requires a restart when switching from disabled to console", () => {
  vi.stubEnv("SMS_PROVIDER", "disabled");
  vi.stubEnv("EMAIL_PROVIDER", "disabled");
  vi.stubEnv("PHONE_VERIFICATION_PROVIDER", "disabled");
  vi.stubEnv("DISABLE_OUTBOUND_DELIVERY", "false");
  expect(getNotificationProviders().sms).toBeUndefined();
  vi.stubEnv("SMS_PROVIDER", "console");
  expect(() => getNotificationProviders()).toThrow("restart required");
});
