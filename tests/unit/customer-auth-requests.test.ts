import { afterEach, expect, it, vi } from "vitest";
import { customerAuthRequest } from "@/app/customer-auth-requests";
afterEach(() => vi.unstubAllGlobals());
it("uses the same-origin auth API and preserves reset token and session revocation intent", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  await customerAuthRequest("reset-password", {
    token: "proof",
    newPassword: "long-new-password",
  });
  expect(fetch).toHaveBeenCalledWith(
    "/api/auth/reset-password",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        token: "proof",
        newPassword: "long-new-password",
      }),
    }),
  );
  await customerAuthRequest("change-password", {
    currentPassword: "old",
    newPassword: "new",
    revokeOtherSessions: true,
  });
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/auth/change-password",
    expect.objectContaining({
      body: JSON.stringify({
        currentPassword: "old",
        newPassword: "new",
        revokeOtherSessions: true,
      }),
    }),
  );
});
it("does not expose auth-provider details when a reset token is expired or reused", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response('{"message":"secret provider detail"}', { status: 400 }),
      ),
  );
  await expect(
    customerAuthRequest("reset-password", { token: "expired" }),
  ).rejects.toThrow("Unable to complete");
});
