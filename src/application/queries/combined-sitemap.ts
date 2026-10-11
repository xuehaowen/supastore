import { sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { storeSettings } from "@/infrastructure/db/schema";
import { DomainError } from "@/domain/errors";
import {
  sitemapResources,
  sitemapPageCount,
  type SitemapResource,
  type SitemapCounts,
  type SitemapEntry,
} from "@/infrastructure/http/sitemap";

const sources = {
  products: { table: "products", column: "handle", published: true },
  collections: {
    table: "product_collections",
    column: "handle",
    published: true,
  },
  categories: { table: "categories", column: "slug", published: false },
} as const;
export async function getCombinedSitemapIndex(): Promise<SitemapCounts> {
  return db.transaction(
    async (tx) => {
      const counts = {} as SitemapCounts;
      for (const resource of sitemapResources) {
        const source = sources[resource];
        const [row] = await tx.execute<{ total: number }>(
          sql`SELECT count(*)::int AS total FROM ${sql.identifier(source.table)} ${source.published ? sql`WHERE is_published = true` : sql``}`,
        );
        counts[resource] = row!.total;
      }
      sitemapPageCount(counts);
      return counts;
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function getCombinedSitemapPage(
  resource: SitemapResource,
  page: number,
): Promise<SitemapEntry[]> {
  if (
    !sitemapResources.includes(resource) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 49999
  )
    throw new DomainError("Invalid sitemap page.");
  const source = sources[resource];
  const rows = await db.execute<{ handle: string; updated_at: Date }>(
    sql`SELECT ${sql.identifier(source.column)} AS handle, updated_at FROM ${sql.identifier(source.table)} ${source.published ? sql`WHERE is_published = true` : sql``} ORDER BY id LIMIT 1000 OFFSET ${(page - 1) * 1000}`,
  );
  return rows.map((row) => ({
    path: `/${resource}/${encodeURIComponent(row.handle)}`,
    updatedAt: new Date(row.updated_at),
  }));
}
export async function getCombinedSitemapStatic(): Promise<SitemapEntry[]> {
  const [store] = await db
    .select({
      publicContent: storeSettings.publicContent,
      defaultLocale: storeSettings.defaultLocale,
    })
    .from(storeSettings)
    .limit(1);
  const entries: SitemapEntry[] = [{ path: "" }];
  for (const key of ["about", "shipping", "returns", "privacy"] as const) {
    const locales = (["en", "zh"] as const).filter(
      (locale) =>
        store?.publicContent[locale]?.[key] ||
        store?.publicContent[store.defaultLocale as "en" | "zh"]?.[key],
    );
    if (locales.length) entries.push({ path: `/pages/${key}`, locales });
  }
  return entries;
}
