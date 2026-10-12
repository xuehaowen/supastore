import { expect, it, vi } from "vitest";
const handlers = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock("@/infrastructure/auth", () => ({ auth: {} }));
vi.mock("better-auth/next-js", () => ({ toNextJsHandler: () => handlers }));
import { POST } from "@/app/api/auth/[...all]/route";

it("passes public registration through to the auth handler", async () => {
  handlers.POST.mockResolvedValue(new Response("ok"));
  for (const path of ["/api/auth/sign-up/email", "/api/auth/sign-up/email/"]) {
    expect(
      (await POST(new Request("http://localhost" + path, { method: "POST" })))
        .status,
    ).toBe(200);
  }
  expect(handlers.POST).toHaveBeenCalledTimes(2);
});

it("passes sign-in through to the auth handler", async () => {
  handlers.POST.mockReset();
  handlers.POST.mockResolvedValue(new Response("ok"));
  expect(
    (
      await POST(
        new Request("http://localhost/api/auth/sign-in/email", {
          method: "POST",
        }),
      )
    ).status,
  ).toBe(200);
  expect(handlers.POST).toHaveBeenCalledOnce();
});
