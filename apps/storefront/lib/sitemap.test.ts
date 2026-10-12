import { expect, it, vi, afterEach } from "vitest";
import { parseSitemapPageDto } from "@supastore/contracts";
import {
  sitemapCount,
  sitemapEntries,
  sitemapIndex,
  sitemapResponse,
} from "./sitemap";
afterEach(() => vi.unstubAllEnvs());
it("streams a sitemap index that exposes all product pages", async () => {
  vi.stubEnv("STOREFRONT_ORIGIN", "https://store.example.test");
  const body = await sitemapResponse(
    sitemapIndex(sitemapCount(1001, 1000)),
  ).text();
  expect(body.match(/<sitemap>/g)).toHaveLength(2);
  expect(body).toContain("https://store.example.test/sitemaps/2.xml");
});
it("includes language alternatives and escapes public URLs", async () => {
  vi.stubEnv("STOREFRONT_ORIGIN", "https://store.example.test");
  const body = await sitemapResponse(
    sitemapEntries(["cup&plate"], true),
  ).text();
  expect(body.match(/<url>/g)).toHaveLength(4);
  expect(body).toContain("/en/products/cup%26plate");
  expect(body).toContain('hreflang="zh"');
  expect(body).toContain('hreflang="x-default"');
});
it("rejects malformed or oversized sitemap discovery responses", () => {
  expect(() =>
    parseSitemapPageDto({
      total: 1001,
      pageSize: 1000,
      items: Array.from({ length: 1001 }, () => ({ handle: "cup" })),
    }),
  ).toThrow();
  expect(() => sitemapCount(1000, 0)).toThrow();
  expect(sitemapCount(0, 1000)).toBe(1);
});
