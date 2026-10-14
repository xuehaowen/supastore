import { describe, expect, it } from "vitest";
import { backendOwnsRoute } from "../../apps/backend/src/infrastructure/http/service-routes";
describe("backend route separation", () => {
  it.each([
    "/admin",
    "/admin/login",
    "/api/v1/customer-pages/catalog",
    "/api/auth/get-session",
    "/_next/static/chunk.js",
    "/backend-assets/_next/static/chunk.js",
  ])("keeps backend route %s", (path) =>
    expect(backendOwnsRoute(path)).toBe(true),
  );
  it.each([
    "/en",
    "/zh/products/cup",
    "/en/cart",
    "/en/checkout",
    "/en/account",
    "/en/orders/id",
    "/recover",
    "/recover/exchange",
    "/admin-fake",
    "/sitemap.xml",
  ])("does not serve customer route %s", (path) =>
    expect(backendOwnsRoute(path)).toBe(false),
  );
});
