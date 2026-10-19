import { describe, expect, it } from "vitest";
import { resolvePublicOrigin } from "../../packages/config/public-origin.mjs";

describe("public storefront origin", () => {
  it("uses the public storefront rather than an internal service address", () => {
    expect(
      resolvePublicOrigin({
        NODE_ENV: "production",
        STOREFRONT_ORIGIN: "https://shop.example.test/",
        APP_URL: "https://app.example.test",
        BETTER_AUTH_URL: "https://auth.example.test",
        BACKEND_URL: "http://backend:3000",
      }),
    ).toBe("https://shop.example.test");
    expect(
      resolvePublicOrigin({ APP_URL: "https://shop.example.test/path" }),
    ).toBe("https://shop.example.test");
    expect(
      resolvePublicOrigin({ BETTER_AUTH_URL: "https://auth.example.test/" }),
    ).toBe("https://auth.example.test");
  });

  it("defaults to the separate storefront locally and fails closed in production", () => {
    expect(resolvePublicOrigin({ NODE_ENV: "development" })).toBe(
      "http://localhost:3001",
    );
    expect(() => resolvePublicOrigin({ NODE_ENV: "production" })).toThrow(
      "required in production",
    );
  });

  it.each([
    "not a URL",
    "ftp://shop.example.test",
    "https://user:secret@shop.example.test",
  ])(
    "rejects invalid configured origins instead of silently using localhost: %s",
    (value) => {
      expect(() => resolvePublicOrigin({ STOREFRONT_ORIGIN: value })).toThrow();
    },
  );
});
