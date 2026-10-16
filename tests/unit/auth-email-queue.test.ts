import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ insert: vi.fn(), values: vi.fn(), transaction: vi.fn() }));
vi.mock("@/infrastructure/db", () => ({ db: { transaction: mocks.transaction } }));
import * as email from "@/infrastructure/notifications/smtp";
import { outboxEvents, eventDeliveries } from "@/infrastructure/db/schema";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockResolvedValue([]);
  mocks.transaction.mockImplementation(work => work({ insert: mocks.insert }));
});
it("persists expiring authentication email atomically without contacting a transport", async () => {
  const result = await email.queueAuthEmail({ recipient: "customer@example.test", template: "auth.email_verification", data: { verificationUrl: "https://shop.test/verify?token=private", token: "private" } });
  expect(result.success).toBe(true);
  expect(mocks.insert).toHaveBeenNthCalledWith(1, outboxEvents);
  expect(mocks.insert).toHaveBeenNthCalledWith(2, eventDeliveries);
  expect(mocks.values).toHaveBeenNthCalledWith(1, expect.objectContaining({ aggregateType: "auth", payload: { verificationUrl: "https://shop.test/verify?token=private" } }));
  expect(mocks.values).toHaveBeenNthCalledWith(2, expect.objectContaining({ channel: "email", expiresAt: expect.any(Date) }));
});
it("propagates persistence failure so a queued acknowledgement is never fabricated", async () => {
  mocks.values.mockRejectedValueOnce(new Error("Database unavailable"));
  await expect(email.queueAuthEmail({ recipient: "customer@example.test", template: "auth.reset_password", data: { resetUrl: "https://shop.test/reset" } })).rejects.toThrow("Database unavailable");
});
