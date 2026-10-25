export const sitemapResources = [
  "products",
  "collections",
  "categories",
] as const;
export type SitemapResource = (typeof sitemapResources)[number];
export type SitemapCounts = Record<SitemapResource, number>;
export interface SitemapEntry {
  path: string;
  updatedAt?: Date;
  locales?: ("en" | "zh")[];
}
export function sitemapPageCount(counts: SitemapCounts) {
  let pages = 1;
  for (const resource of sitemapResources) {
    const count = counts[resource];
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error("Invalid sitemap count.");
    pages += Math.ceil(count / 1000);
  }
  if (pages > 50000) throw new Error("Catalog exceeds sitemap capacity.");
  return pages;
}
