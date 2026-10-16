import { beforeEach, describe, expect, it, vi } from "vitest";
import { serverRequest } from "./server-request";
import * as requests from "./server-request";
const { proxy, setCookie } = vi.hoisted(() => ({
  proxy: vi.fn(),
  setCookie: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      cookie: "shop-cart=synthetic",
      "x-forwarded-for": "spoofed",
    }),
  cookies: async () => ({ set: setCookie }),
}));
vi.mock("./backend-proxy", () => ({ proxyBackendApi: proxy }));
beforeEach(() => {
  proxy.mockReset();
  setCookie.mockReset();
});
describe("original customer server actions across services", () => {
  it("preserves backend failure references across the storefront boundary", async () => {
    const requestId = "11111111-1111-4111-8111-111111111111";
    proxy.mockResolvedValue(
      Response.json(
        { error: { message: "Unable to complete request." } },
        { status: 500, headers: { "x-request-id": requestId } },
      ),
    );
    await expect(serverRequest("orders", {})).rejects.toMatchObject({
      status: 500,
      requestId,
    });
  });
  it("logs local action failures without exposing input or raw messages", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(
        requests.actionFailure(
          new Error("private database token"),
          "checkout.create",
        ),
      ).toMatchObject({
        message: "Unable to save. Please retry.",
        requestId: expect.any(String),
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    } finally {
      log.mockRestore();
    }
  });
  it("forwards session cookies and relays all private response cookies with their options", async () => {
    const response = Response.json({ data: { id: "new-order" } });
    response.headers.append(
      "set-cookie",
      "shop-cart=cart; Path=/; HttpOnly; SameSite=Lax",
    );
    response.headers.append(
      "set-cookie",
      "shop-order-new-order=proof; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000",
    );
    proxy.mockResolvedValue(response);
    await expect(serverRequest("orders", { accepted: true })).resolves.toEqual({
      id: "new-order",
    });
    const request = proxy.mock.calls[0]![0] as Request;
    expect(request.headers.get("cookie")).toBe("shop-cart=synthetic");
    expect(request.headers.get("x-forwarded-for")).toBeNull();
    expect(await request.json()).toEqual({ accepted: true });
    expect(setCookie).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "shop-cart",
        httpOnly: true,
        path: "/",
        sameSite: "lax",
      }),
    );
    expect(setCookie).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "shop-order-new-order",
        httpOnly: true,
        secure: true,
        maxAge: 2592000,
      }),
    );
  });
  it("propagates backend validation errors rather than reporting success", async () => {
    proxy.mockResolvedValue(
      Response.json(
        { error: { message: "Choose an active payment method." } },
        { status: 400 },
      ),
    );
    await expect(serverRequest("quotes", {})).rejects.toMatchObject({
      status: 400,
      message: "Choose an active payment method.",
    });
    expect(setCookie).not.toHaveBeenCalled();
  });
});
