import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  products,
  productCollections,
  storeSettings,
  categories,
} from "@/infrastructure/db/schema";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const [items, collections, settings, categoryRows] = await Promise.all([
    db
      .select({ handle: products.handle, updatedAt: products.updatedAt })
      .from(products)
      .where(eq(products.isPublished, true))
      .limit(20000),
    db
      .select({
        handle: productCollections.handle,
        updatedAt: productCollections.updatedAt,
      })
      .from(productCollections)
      .where(eq(productCollections.isPublished, true))
      .limit(1000),
    db.select().from(storeSettings).limit(1),
    db.select({ slug: categories.slug }).from(categories).limit(1000),
  ]);
  const store = settings[0];
  return ["en", "zh"].flatMap((locale) => [
    { url: `${base}/${locale}` },
    ...categoryRows.map((category) => ({
      url: `${base}/${locale}/categories/${encodeURIComponent(category.slug)}`,
    })),
    ...items.map((p) => ({
      url: `${base}/${locale}/products/${encodeURIComponent(p.handle)}`,
      lastModified: p.updatedAt,
    })),
    ...collections.map((c) => ({
      url: `${base}/${locale}/collections/${encodeURIComponent(c.handle)}`,
      lastModified: c.updatedAt,
    })),
    ...(["about", "shipping", "returns", "privacy"] as const)
      .filter(
        (key) =>
          store?.publicContent[locale as "en" | "zh"]?.[key] ||
          store?.publicContent[store.defaultLocale as "en" | "zh"]?.[key],
      )
      .map((key) => ({ url: `${base}/${locale}/pages/${key}` })),
  ]);
}
