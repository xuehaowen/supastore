import { afterEach, describe, expect, it, vi } from "vitest";
import {
  validSmsPhone,
  smsQuietUntil,
} from "@/application/notifications/sms-policy";
import {
  defaultTemplate,
  renderTemplate,
  previewValues,
} from "@/application/notifications/templates";
import { liveSmsAuthorized } from "@/infrastructure/bootstrap/notification-providers";
import { POST as retiredTwilioCallback } from "@/app/api/notifications/twilio/route";
afterEach(() => vi.unstubAllEnvs());
describe("optional SMS safety contracts", () => {
  it("keeps external sending disabled pending explicit authorization", () => {
    vi.stubEnv("SMS_ENABLED", "true");
    expect(liveSmsAuthorized()).toBe(false);
  });
  it("requires an international phone number", () => {
    expect(validSmsPhone("+12025550123")).toBe(true);
    expect(validSmsPhone("2025550123")).toBe(false);
    expect(validSmsPhone("+0bad")).toBe(false);
  });
  it("retires the old provider callback without processing customer data", async () => {
    expect((await retiredTwilioCallback()).status).toBe(410);
  });
  it("uses recipient timezone quiet hours, including DST", () => {
    expect(
      smsQuietUntil("America/Los_Angeles", new Date("2026-10-06T15:00:00Z")),
    ).toBeNull();
    expect(
      smsQuietUntil("America/Los_Angeles", new Date("2026-10-06T14:00:00Z")),
    ).toEqual(new Date("2026-10-06T15:00:00Z"));
    expect(
      smsQuietUntil("America/Los_Angeles", new Date("2026-12-06T15:00:00Z")),
    ).not.toBeNull();
  });
  it("limits templates to order status/reference and supports locale", () => {
    for (const locale of ["en", "zh"] as const) {
      const key = {
        event: "order.confirmed",
        channel: "sms",
        audience: "customer",
        locale,
      } as const;
      const message = renderTemplate(
        key,
        defaultTemplate(key),
        { ...previewValues(), "order.reference": "ABC123" },
        "delivery",
        "+12025550123",
      );
      expect(message.text).toContain(locale === "zh" ? "已确认" : "ABC123");
    }
    expect(() =>
      defaultTemplate({
        event: "reward.earned",
        channel: "sms",
        audience: "customer",
        locale: "en",
      }),
    ).toThrow();
  });
});
