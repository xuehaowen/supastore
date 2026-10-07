import { expect, it } from "vitest";
import {
  smsDeliveryAllowed,
  smsQuietUntil,
  renderOrderSms,
} from "@/application/notifications/sms-policy";
it("rejects obsolete consent and recipient phone changes", () => {
  const preference = {
    phone: "+12025550123",
    optedIn: true,
    verifiedAt: new Date(),
    consentAt: new Date("2026-10-06T12:00:00Z"),
  };
  expect(
    smsDeliveryAllowed(
      preference,
      preference.phone,
      new Date("2026-10-06T13:00:00Z"),
    ),
  ).toBe(true);
  expect(
    smsDeliveryAllowed(
      preference,
      preference.phone,
      new Date("2026-10-06T11:00:00Z"),
    ),
  ).toBe(false);
  expect(smsDeliveryAllowed(preference, "+12025550999", new Date())).toBe(
    false,
  );
  expect(
    smsDeliveryAllowed(
      { ...preference, optedIn: false },
      preference.phone,
      new Date(),
    ),
  ).toBe(false);
});
it("handles quiet hours and invalid timezone conservatively", () => {
  expect(
    smsQuietUntil("America/Los_Angeles", new Date("2026-10-06T15:00:00Z")),
  ).toBeNull();
  expect(
    smsQuietUntil("invalid", new Date("2026-10-06T15:00:00Z")),
  ).not.toBeNull();
});
it("renders only status/reference and supports Chinese", () => {
  const message = renderOrderSms(
    "delivery",
    "+12025550123",
    "order.confirmed",
    { referenceCode: "ORDER123", total: 999, orderToken: "secret" },
    "zh",
  );
  expect(message.text).toContain("已确认");
  expect(message.text).not.toContain("999");
  expect(message.text).not.toContain("secret");
});
