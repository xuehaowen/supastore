import { describe, it, expect, vi, afterEach } from "vitest";
import { logger } from "@/infrastructure/security/logger";
import {
  assertMutationOrigin,
  readApiBody,
  apiResponse,
  apiInteger,
} from "@/infrastructure/http/commerce-api";
import { UnauthorizedError, ConflictError } from "@/application/common/errors";
describe("commerce API boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  it.each(["APP_URL", "STOREFRONT_ORIGIN", "BETTER_AUTH_URL"])(
    "accepts a proxied mutation with only %s configured, including trailing slashes",
    (key) => {
      for (const name of ["APP_URL", "STOREFRONT_ORIGIN", "BETTER_AUTH_URL"])
        vi.stubEnv(name, undefined);
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv(key, "https://shop.example.test/");
      const request = new Request("http://backend:3000/api/v1/cart", {
        method: "POST",
        headers: {
          origin: "https://shop.example.test",
          "content-type": "application/json",
        },
        body: "{}",
      });
      expect(() => assertMutationOrigin(request)).not.toThrow();
      request.headers.set("sec-fetch-site", "cross-site");
      expect(() => assertMutationOrigin(request)).toThrow("Untrusted");
    },
  );
  it("correlates unexpected failures through the structured logger without exposing details", async () => {
    const logError = vi.fn();
    const child = vi
      .spyOn(logger, "child")
      .mockReturnValue({ ...logger, error: logError });
    const failure = new Error("Synthetic database failure");
    const response = await apiResponse(async () => {
      throw failure;
    });
    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload.error.message).toBe("Unable to complete request.");
    expect(payload.requestId).toBe(response.headers.get("x-request-id"));
    expect(child).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: payload.requestId,
        operation: "commerce.api",
      }),
    );
    expect(logError).toHaveBeenCalledWith("Operation failed.");
    expect(JSON.stringify(logError.mock.calls)).not.toContain(failure.message);
  });
  const request = (body: string, origin = "https://shop.example") =>
    new Request("https://shop.example/api/v1/cart", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body,
    });
  it("rejects missing and foreign origin before mutations", () => {
    expect(() =>
      assertMutationOrigin(new Request("https://shop.example/api/v1/cart")),
    ).toThrow("Untrusted");
    expect(() =>
      assertMutationOrigin(request("{}", "https://attacker.example")),
    ).toThrow("Untrusted");
    expect(() => assertMutationOrigin(request("{}"))).not.toThrow();
  });
  it("bounds chunked bodies and rejects malformed/non-object JSON", async () => {
    await expect(
      readApiBody(request(JSON.stringify({ data: "x".repeat(32768) }))),
    ).rejects.toThrow("too large");
    await expect(readApiBody(request("[1]"))).rejects.toThrow("object");
    await expect(readApiBody(request("{"))).rejects.toThrow("Invalid JSON");
  });
  it("rejects coercion, fractions and out-of-range amounts", () => {
    for (const quantity of ["1", 1.2, -1, Infinity, 1000])
      expect(() => apiInteger({ quantity }, "quantity", 0, 999)).toThrow();
  });
  it("provides translatable quantity errors while preserving strict JSON number validation", async () => {
    for (const [quantity, min, message] of [
      [-1, 0, "Quantity must be at least 0."],
      [0, 1, "Quantity must be at least 1."],
      [1000, 1, "Quantity must be at most 999."],
      [1.5, 1, "Quantity must be an integer."],
      ["1", 1, "Quantity must be an integer."],
      [null, 1, "Quantity must be an integer."],
    ] as const) {
      const response = await apiResponse(async () =>
        apiInteger({ quantity }, "quantity", min, 999, undefined, "Quantity"),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.message).toBe(message);
    }
    expect(
      apiInteger({ quantity: 0 }, "quantity", 0, 999, undefined, "Quantity"),
    ).toBe(0);
    expect(
      apiInteger({ quantity: 999 }, "quantity", 1, 999, undefined, "Quantity"),
    ).toBe(999);
  });
  it("maps authorization and conflicts and never caches private responses", async () => {
    const unauthorized = await apiResponse(async () => {
      throw new UnauthorizedError();
    });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("cache-control")).toBe("private, no-store");
    const conflict = await apiResponse(async () => {
      throw new ConflictError("Quote changed.");
    });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.message).toBe("Quote changed.");
  });
});
