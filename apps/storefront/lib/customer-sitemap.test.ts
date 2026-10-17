import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseSitemapCounts,
  parseSitemapEntries,
  customerSitemapIndex,
  customerSitemapEntries,
} from "./customer-sitemap";
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
afterEach(() => vi.unstubAllEnvs());
describe("original public discoverability on separate storefront", () => {
  it("points x-default at the published locale when English is absent", () => {
    const body = [...customerSitemapEntries([{ path: "/pages/about", locales: ["zh"] }])].join("");
    expect(body).toContain('hreflang="x-default" href="http://localhost:3001/zh/pages/about"');
    expect(body).not.toContain('/en/pages/about');
  });
  it("indexes product, category, collection and static shards with the public origin", () => {
    vi.stubEnv("STOREFRONT_ORIGIN", "http://localhost:3001");
    const counts = parseSitemapCounts({
      products: 1001,
      categories: 2,
      collections: 1,
    });
    const xml = [...customerSitemapIndex(counts)].join("");
    for (const shard of [
      "static",
      "products-1",
      "products-2",
      "categories-1",
      "collections-1",
    ])
      expect(xml).toContain(`http://localhost:3001/sitemaps/${shard}.xml`);
    expect(() =>
      parseSitemapCounts({ products: -1, categories: 0, collections: 0 }),
    ).toThrow();
  });
  it("restores timestamps and honors policy locale fallback while escaping XML", () => {
    const entries = parseSitemapEntries([
      {
        path: "/pages/about",
        locales: ["en"],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const xml = [...customerSitemapEntries(entries)].join("");
    expect(xml).toContain("/en/pages/about");
    expect(xml).not.toContain("/zh/pages/about");
    expect(xml).toContain("<lastmod>2026-01-01T00:00:00.000Z</lastmod>");
    expect(() =>
      parseSitemapEntries([{ path: "//evil.example", locales: ["en"] }]),
    ).toThrow();
    expect(() =>
      parseSitemapEntries([{ path: "/pages/about", updatedAt: "bad-date" }]),
    ).toThrow();
  });
});
