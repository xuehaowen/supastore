import { afterEach, describe, expect, it, vi } from "vitest";
import { validSmsPhone, smsQuietUntil, smsText } from "@/application/notifications/sms-policy";
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
    expect(smsQuietUntil("America/Los_Angeles", new Date("2026-10-06T15:00:00Z"))).toBeNull();
    expect(smsQuietUntil("America/Los_Angeles", new Date("2026-10-06T14:00:00Z"))).toEqual(new Date("2026-10-06T15:00:00Z"));
    expect(smsQuietUntil("America/Los_Angeles", new Date("2026-12-06T15:00:00Z"))).not.toBeNull();
  });
  it("limits templates to order status/reference and supports locale", () => {
    expect(smsText("order.confirmed", "ABC123", "en")).toContain("ABC123");
    expect(smsText("order.confirmed", "ABC123", "zh")).toContain("已确认");
    expect(() => smsText("reward.earned", "ABC123", "en")).toThrow();
  });
});
