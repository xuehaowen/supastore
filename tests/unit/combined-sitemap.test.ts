import { afterEach, expect, it, vi } from "vitest";
import { sitemapIndex, sitemapEntries, sitemapResponse, sitemapPageCount } from "@/infrastructure/http/sitemap";

afterEach(() => vi.unstubAllEnvs());
it("exposes every resource page and rejects index overflow", async () => {
  vi.stubEnv("APP_URL", "https://shop.example.test");
  const counts = { products: 2001, collections: 1001, categories: 1001 };
  const body = await sitemapResponse(sitemapIndex(counts)).text();
  expect(body.match(/<sitemap>/g)).toHaveLength(8);
  expect(body).toContain("/sitemaps/products-3.xml");
  expect(body).toContain("/sitemaps/collections-2.xml");
  expect(body).toContain("/sitemaps/categories-2.xml");
  expect(() => sitemapPageCount({ ...counts, products: 50000000 })).toThrow("capacity");
});
it("streams escaped bilingual URLs and preserves content locale availability", async () => {
  vi.stubEnv("APP_URL", "https://shop.example.test");
  const body = await sitemapResponse(sitemapEntries([
    { path: "/products/cup&plate", updatedAt: new Date("2026-01-01T00:00:00Z") },
    { path: "/pages/privacy", locales: ["zh"] },
  ])).text();
  expect(body.match(/<url>/g)).toHaveLength(3);
  expect(body).toContain("/en/products/cup&amp;plate");
  expect(body).toContain("<lastmod>2026-01-01T00:00:00.000Z</lastmod>");
  expect(body).not.toContain("/en/pages/privacy");
});
it("closes the sitemap iterator on cancellation", async () => {
  let closed = false;
  function* source() { try { while (true) yield "entry"; } finally { closed = true; } }
  const reader = sitemapResponse(source()).body!.getReader();
  await reader.read();
  await reader.cancel();
  expect(closed).toBe(true);
});
