import {
  sitemapPageCount,
  sitemapResources,
  type SitemapCounts,
  type SitemapEntry,
} from "@supastore/contracts/sitemap";
import { readApi } from "./api";
import { alternateLinks, publicOrigin } from "./seo";
import { xml, sitemapResponse } from "./sitemap";
export { sitemapResponse };
export function parseSitemapCounts(value: unknown): SitemapCounts {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid sitemap index.");
  const counts = value as SitemapCounts;
  sitemapPageCount(counts);
  return counts;
}
export function parseSitemapEntries(value: unknown): SitemapEntry[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error("Invalid sitemap page.");
  return value.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.path !== "string" ||
      !/^(?:\/(?:products|categories|collections)\/[^/\s]+|\/pages\/(?:about|support|shipping|returns|privacy|terms))?$/.test(
        item.path,
      ) ||
      (item.locales !== undefined &&
        (!Array.isArray(item.locales) ||
          !item.locales.length ||
          item.locales.some(
            (locale: unknown) => locale !== "en" && locale !== "zh",
          ))) ||
      (item.updatedAt !== undefined &&
        (typeof item.updatedAt !== "string" ||
          !Number.isFinite(Date.parse(item.updatedAt))))
    )
      throw new Error("Invalid sitemap entry.");
    return {
      path: item.path,
      ...(item.locales ? { locales: item.locales } : {}),
      ...(item.updatedAt ? { updatedAt: new Date(item.updatedAt) } : {}),
    };
  });
}
export const readSitemapCounts = () =>
  readApi("customer-sitemap?index=1", parseSitemapCounts);
export const readSitemapEntries = (resource: string, page = 1) =>
  readApi(
    `customer-sitemap?resource=${resource}&page=${page}`,
    parseSitemapEntries,
  );
export function* customerSitemapIndex(counts: SitemapCounts) {
  sitemapPageCount(counts);
  yield '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  yield `<sitemap><loc>${xml(`${publicOrigin()}/sitemaps/static.xml`)}</loc></sitemap>`;
  for (const resource of sitemapResources)
    for (let page = 1; page <= Math.ceil(counts[resource] / 1000); page++)
      yield `<sitemap><loc>${xml(`${publicOrigin()}/sitemaps/${resource}-${page}.xml`)}</loc></sitemap>`;
  yield "</sitemapindex>";
}
export function* customerSitemapEntries(entries: SitemapEntry[]) {
  yield '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">';
  for (const entry of entries)
    for (const locale of entry.locales ?? ["en", "zh"]) {
      const alternates = Object.entries(
        alternateLinks(entry.path, entry.locales),
      )
        .filter(
          ([language]) =>
            language === "x-default" ||
            !entry.locales ||
            entry.locales.includes(language as "en" | "zh"),
        )
        .map(
          ([language, url]) =>
            `<xhtml:link rel="alternate" hreflang="${language}" href="${xml(url)}"/>`,
        )
        .join("");
      yield `<url><loc>${xml(`${publicOrigin()}/${locale}${entry.path}`)}</loc>${entry.updatedAt ? `<lastmod>${entry.updatedAt.toISOString()}</lastmod>` : ""}${alternates}</url>`;
    }
  yield "</urlset>";
}
