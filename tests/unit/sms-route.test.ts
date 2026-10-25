import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  providers: {} as Record<string, unknown>,
  update: vi.fn(),
}));
vi.mock("@/infrastructure/bootstrap/notification-providers", () => ({
  getNotificationProviders: () => state.providers,
}));
vi.mock("@/application/use-cases/customers/sms-preferences", () => ({
  updateCustomerSms: state.update,
}));
import { POST } from "@/app/api/v1/sms/route";
function request(
  body: Record<string, unknown>,
  origin = "http://localhost:3000",
) {
  return new Request("http://localhost:3000/api/v1/sms", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  state.providers = {};
  state.update.mockReset();
});
describe("public SMS enrollment boundary", () => {
  it("does not enroll customers through console preview mode", async () => {
    state.providers = {
      sms: { capabilities: { previewOnly: true } },
      phone: {},
    };
    expect((await POST(request({ operation: "start" }))).status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
  });
  it("rejects cross-site submissions and unavailable transports", async () => {
    expect(
      (await POST(request({ operation: "start" }, "https://untrusted.example")))
        .status,
    ).toBe(403);
    expect((await POST(request({ operation: "start" }))).status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
  });
  it("does not allow public callers to mutate account preferences or invent enrollment IDs", async () => {
    state.providers = { sms: {}, phone: {} };
    expect((await POST(request({ operation: "disable" }))).status).toBe(400);
    expect(
      (
        await POST(
          request({ operation: "confirm", preferenceId: "not-a-uuid" }),
        )
      ).status,
    ).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
  });
  it("passes literal consent and supported source values to the verification use case", async () => {
    state.providers = { sms: {}, phone: {} };
    state.update.mockResolvedValue({
      preferenceId: "request",
      verified: false,
    });
    expect(
      (
        await POST(
          request({
            operation: "start",
            phone: "+12025550123",
            consent: "true",
            source: "invented",
            disclosure: "current text",
          }),
        )
      ).status,
    ).toBe(200);
    expect(state.update).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        consent: false,
        source: "sms-page",
        disclosure: "current text",
      }),
      state.providers.phone,
      true,
    );
  });
});
