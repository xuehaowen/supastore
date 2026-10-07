import type { MetadataRoute } from "next";
import { readApi } from "../lib/api";
import { alternateLinks, publicOrigin } from "../lib/seo";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = ["en", "zh"].map((locale) => ({
    url: `${publicOrigin()}/${locale}`,
    alternates: { languages: alternateLinks("") },
  }));
  for (let page = 1; page <= 10000; page++) {
    const catalog = await readApi<{
      total: number;
      pageSize: number;
      items: { handle: string }[];
    }>(`catalog?locale=en&pageSize=100&page=${page}`);
    for (const item of catalog.items) {
      const path = `/products/${encodeURIComponent(item.handle)}`;
      for (const locale of ["en", "zh"])
        entries.push({
          url: `${publicOrigin()}/${locale}${path}`,
          alternates: { languages: alternateLinks(path) },
        });
    }
    if (page * catalog.pageSize >= catalog.total || !catalog.items.length)
      break;
  }
  return entries;
}
