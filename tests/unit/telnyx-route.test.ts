import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({
  persistNotificationEvent: vi.fn(),
  persistUnmatchedNotificationEvent: vi.fn(),
}));
vi.mock("@/application/notifications/notification-inbox", () => storage);
import { POST } from "@/app/api/notifications/telnyx/route";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const keys = generateKeyPairSync("ed25519");
function request(status = "message.sent") {
  const body = JSON.stringify({
    data: {
      id: "event",
      event_type: status,
      occurred_at: new Date().toISOString(),
      payload: {
        id: "message",
        messaging_profile_id: "profile",
        from: { phone_number: "+12025550123" },
        to: [{ phone_number: "+12025550124" }],
      },
    },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  vi.stubEnv(
    "TELNYX_PUBLIC_KEY",
    keys.publicKey
      .export({ format: "der", type: "spki" })
      .subarray(-32)
      .toString("base64"),
  );
  return new Request("https://store.example/api/notifications/telnyx", {
    method: "POST",
    body,
    headers: {
      "telnyx-timestamp": timestamp,
      "telnyx-signature-ed25519": sign(
        null,
        Buffer.from(timestamp + "|" + body),
        keys.privateKey,
      ).toString("base64"),
    },
  });
}
it("ACKs only after durable commit and returns retryable failure on unavailable persistence", async () => {
  storage.persistNotificationEvent.mockRejectedValueOnce(new Error("DB down"));
  expect((await POST(request())).status).toBe(503);
  storage.persistNotificationEvent.mockResolvedValueOnce("inbox");
  expect((await POST(request())).status).toBe(200);
  expect(storage.persistNotificationEvent).toHaveBeenCalledWith(
    expect.objectContaining({ state: "sent" }),
    expect.any(String),
  );
});
it("persists verified unsupported callbacks instead of dropping them", async () => {
  storage.persistUnmatchedNotificationEvent.mockResolvedValueOnce("inbox");
  expect((await POST(request("message.unrecognized"))).status).toBe(200);
  expect(storage.persistUnmatchedNotificationEvent).toHaveBeenCalledOnce();
});
it("bounds request bytes and rejects missing public keys", async () => {
  vi.stubEnv("TELNYX_PUBLIC_KEY", "");
  expect(
    (
      await POST(
        new Request("https://store.example", { method: "POST", body: "{}" }),
      )
    ).status,
  ).toBe(503);
  vi.stubEnv("TELNYX_PUBLIC_KEY", "configured");
  expect(
    (
      await POST(
        new Request("https://store.example", {
          method: "POST",
          body: "a".repeat(16385),
        }),
      )
    ).status,
  ).toBe(413);
});
