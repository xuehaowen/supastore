import { describe, it, expect } from "vitest";
import {
  assertMutationOrigin,
  readApiBody,
  apiResponse,
  apiInteger,
} from "@/infrastructure/http/commerce-api";
import { UnauthorizedError, ConflictError } from "@/application/common/errors";
describe("commerce API boundary", () => {
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
