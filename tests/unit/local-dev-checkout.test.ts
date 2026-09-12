import { describe, expect, it, vi, afterEach } from "vitest";
import { pickupAvailability } from "@/domain/pickup-availability";

const mail = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));
vi.mock("nodemailer", () => ({
  default: { createTransport: mail.createTransport },
}));
import { smtpAdapter } from "@/infrastructure/notifications/smtp";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("pickup date choices", () => {
  it("filters weekdays, blackout dates, and preparation time in the store timezone", () => {
    const dates = pickupAvailability(
      {
        weeklySchedule: {
          mon: [
            ["09:00", "12:00"],
            ["14:00", "17:00"],
          ],
          tue: [["10:00", "11:00"]],
        },
        blackoutDates: ["2026-09-08"],
        prepMinutes: 60,
      },
      "America/Los_Angeles",
      new Date("2026-09-07T16:30:00Z"),
    );
    expect(dates[0]).toEqual({
      date: "2026-09-07",
      slots: [{ date: "2026-09-07", startTime: "14:00", endTime: "17:00" }],
    });
    expect(dates.some((day) => day.date === "2026-09-08")).toBe(false);
    expect(dates[1].date).toBe("2026-09-14");
  });
  it("uses the local calendar date across UTC midnight", () => {
    const dates = pickupAvailability(
      {
        weeklySchedule: { sun: [["20:00", "21:00"]] },
        blackoutDates: [],
        prepMinutes: 0,
      },
      "America/Los_Angeles",
      new Date("2026-09-07T01:00:00Z"),
    );
    expect(dates[0].date).toBe("2026-09-06");
  });
});

describe("SMTP delivery", () => {
  it("defaults port 465 to implicit TLS", async () => {
    vi.stubEnv("SMTP_PORT", "465");
    vi.stubEnv("SMTP_SECURE", undefined);
    mail.createTransport.mockReturnValue({ sendMail: mail.sendMail });
    mail.sendMail.mockResolvedValue({
      accepted: ["owner@example.test"],
      messageId: "test",
    });
    await expect(
      smtpAdapter.sendEmail({
        recipient: "owner@example.test",
        subject: "test",
        template: "test",
        data: {},
      }),
    ).resolves.toMatchObject({ success: true });
    expect(mail.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });
  it("does not report rejected recipients as successful", async () => {
    mail.createTransport.mockReturnValue({ sendMail: mail.sendMail });
    mail.sendMail.mockResolvedValue({
      accepted: [],
      rejected: ["owner@example.test"],
    });
    await expect(
      smtpAdapter.sendEmail({
        recipient: "owner@example.test",
        subject: "test",
        template: "test",
        data: {},
      }),
    ).resolves.toMatchObject({ success: false });
  });
});
