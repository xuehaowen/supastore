import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  update: vi.fn(),
  providers: vi.fn(() => {
    throw new Error("Invalid provider configuration");
  }),
}));
vi.mock("@/infrastructure/db", () => ({ db: {} }));
vi.mock("@/infrastructure/web", () => ({
  customerIdentity: async () => "verified-customer",
}));
vi.mock("@/infrastructure/bootstrap/notification-providers", () => ({
  getNotificationProviders: state.providers,
}));
vi.mock("@/application/use-cases/customers/sms-preferences", () => ({
  updateCustomerSms: state.update,
  customerSms: vi.fn(),
}));
import { POST } from "@/app/api/v1/account/sms/route";
it("allows account withdrawal without constructing unavailable providers", async () => {
  const response = await POST(
    new Request("http://localhost:3000/api/v1/account/sms", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ operation: "disable" }),
    }),
  );
  expect(response.status).toBe(200);
  expect(state.update).toHaveBeenCalledWith("verified-customer", {
    operation: "disable",
  });
  expect(state.providers).not.toHaveBeenCalled();
});
