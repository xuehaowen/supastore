import { beforeEach, expect, it, vi } from "vitest";
const handlers = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock("@/infrastructure/auth", () => ({ staffAuth: {} }));
vi.mock("better-auth/next-js", () => ({ toNextJsHandler: () => handlers }));
import { GET, POST } from "@/app/api/admin-auth/[...all]/route";
beforeEach(() => {
  handlers.GET.mockReset().mockResolvedValue(new Response("ok"));
  handlers.POST.mockReset().mockResolvedValue(new Response("ok"));
});
it.each([
  "sign-up/email",
  "reset-password",
  "change-password",
  "verify-email",
  "list-sessions",
  "revoke-sessions",
])("does not expose staff %s", async (path) => {
  expect(
    (
      await POST(
        new Request(`http://localhost/api/admin-auth/${path}`, {
          method: "POST",
        }),
      )
    ).status,
  ).toBe(404);
  expect(handlers.POST).not.toHaveBeenCalled();
});
it("routes staff session reads and sign-in/sign-out only to the staff handler", async () => {
  expect(
    (await GET(new Request("http://localhost/api/admin-auth/get-session")))
      .status,
  ).toBe(200);
  for (const path of ["sign-in/email", "sign-out"])
    expect(
      (
        await POST(
          new Request(`http://localhost/api/admin-auth/${path}`, {
            method: "POST",
          }),
        )
      ).status,
    ).toBe(200);
  expect(handlers.GET).toHaveBeenCalledOnce();
  expect(handlers.POST).toHaveBeenCalledTimes(2);
});

it("exposes bounded same-origin authenticator requests without trusted-device bypass", async () => {
  for (const body of [
    { code: "123456", trustDevice: true },
    { method: "otp" },
    { code: "x".repeat(40000) },
  ]) {
    expect(
      (
        await POST(
          new Request(
            "http://localhost/api/admin-auth/two-factor/verify-totp",
            {
              method: "POST",
              headers: {
                origin: "http://localhost",
                "content-type": "application/json",
              },
              body: JSON.stringify(body),
            },
          ),
        )
      ).status,
    ).toBe(400);
  }
  expect(handlers.POST).not.toHaveBeenCalled();
  const result = await POST(
    new Request("http://localhost/api/admin-auth/two-factor/verify-totp", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify({ code: "123456" }),
    }),
  );
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(handlers.POST).toHaveBeenCalledOnce();
});
