import { describe, expect, it } from "vitest";
import { pickupReminderTime, reminderIsCurrent } from "@/domain/scheduled-work";

describe("pickup reminder scheduling", () => {
  it("uses the pickup timezone rather than the process timezone", () => {
    expect(
      pickupReminderTime("2026-10-25", "15:00", "America/Los_Angeles", 180),
    ).toEqual({
      scheduledFor: new Date("2026-10-25T19:00:00Z"),
      expiresAt: new Date("2026-10-25T22:00:00Z"),
    });
  });
  it("accounts for daylight saving and rejects nonexistent or ambiguous times", () => {
    expect(
      pickupReminderTime(
        "2026-11-02",
        "15:00",
        "America/Los_Angeles",
        180,
      ).scheduledFor.toISOString(),
    ).toBe("2026-11-02T20:00:00.000Z");
    expect(() =>
      pickupReminderTime("2026-03-08", "02:30", "America/Los_Angeles", 180),
    ).toThrow();
    expect(() =>
      pickupReminderTime("2026-11-01", "01:30", "America/Los_Angeles", 180),
    ).toThrow();
    expect(() =>
      pickupReminderTime("2026-10-25", "15:00", "UTC", -1),
    ).toThrow();
  });
  it("suppresses stale, cancelled, collected, and replaced bookings", () => {
    const input = {
      lifecycleStatus: "confirmed",
      fulfillmentStatus: "ready_for_pickup",
      currentSlotId: "a",
      expectedSlotId: "a",
      expiresAt: new Date(2000),
      now: new Date(1000),
    };
    expect(reminderIsCurrent(input)).toBe(true);
    for (const change of [
      { lifecycleStatus: "cancelled" },
      { fulfillmentStatus: "fulfilled" },
      { currentSlotId: "b" },
      { now: new Date(2000) },
    ]) {
      expect(reminderIsCurrent({ ...input, ...change })).toBe(false);
    }
  });
});
