import { expect, it } from "vitest";
import { quoteDelivery, validateDeliveryArea } from "@/domain/delivery";
import { validateDeliverySchedule } from "@/domain/delivery";
it("supports unscheduled areas and requires windows for scheduled delivery", () => {
  expect(validateDeliveryArea(area).scheduleRequired).toBe(false);
  expect(() =>
    validateDeliveryArea({ ...area, scheduleRequired: true }),
  ).toThrow();
  expect(
    validateDeliveryArea({
      ...area,
      scheduleRequired: true,
      weeklySchedule: { mon: [["09:00", "12:00"]] },
      slotCapacity: 3,
    }).slotCapacity,
  ).toBe(3);
});
it("rejects overlapping windows, invalid weekday/time and capacity", () => {
  expect(() =>
    validateDeliverySchedule({
      mon: [
        ["09:00", "12:00"],
        ["11:00", "13:00"],
      ],
    }),
  ).toThrow();
  expect(() => validateDeliverySchedule({ monday: [] })).toThrow();
  expect(() =>
    validateDeliverySchedule({ mon: [["25:00", "26:00"]] }),
  ).toThrow();
  expect(() => validateDeliveryArea({ ...area, slotCapacity: -1 })).toThrow();
});
const area = {
  id: "area",
  name: "City",
  countryCodes: ["US"],
  postalPrefixes: ["981"],
  rateCents: 500,
  freeThresholdCents: 5000,
  isActive: true,
};
it("enforces country and postal eligibility, normalizes postal codes", () => {
  expect(quoteDelivery(area, "us", "98101", 1000).rateCents).toBe(500);
  expect(() => quoteDelivery(area, "CA", "98101", 1000)).toThrow();
  expect(() => quoteDelivery(area, "US", "98000", 1000)).toThrow();
  expect(() =>
    quoteDelivery({ ...area, isActive: false }, "US", "98101", 1000),
  ).toThrow();
});
it("applies free delivery at the threshold and supports whole-country areas", () => {
  expect(quoteDelivery(area, "US", "98101", 5000).rateCents).toBe(0);
  expect(
    quoteDelivery(
      { ...area, countryCodes: ["CA"], postalPrefixes: [] },
      "CA",
      "V6B 1A1",
      4999,
    ).postalCode,
  ).toBe("V6B1A1");
});
it("validates bounded rates, countries and postal prefix configuration", () => {
  expect(
    validateDeliveryArea({ ...area, postalPrefixes: [" V6B ", "v6b"] })
      .postalPrefixes,
  ).toEqual(["V6B"]);
  expect(() => validateDeliveryArea({ ...area, countryCodes: [] })).toThrow();
  expect(() => validateDeliveryArea({ ...area, rateCents: -1 })).toThrow();
  expect(() =>
    validateDeliveryArea({ ...area, postalPrefixes: ["*"] }),
  ).toThrow();
});
