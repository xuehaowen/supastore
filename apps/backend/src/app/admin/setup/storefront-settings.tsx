import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { StorefrontHero } from "@supastore/contracts";
import { db } from "@/infrastructure/db";
import {
  productImages,
  products,
  productCollections,
} from "@/infrastructure/db/schema";
import { StorefrontSettingsForm } from "./storefront-settings-form";
import { Button } from "@supastore/ui/button";
import { Input } from "@supastore/ui/input";

export async function StorefrontSettings({
  hero,
  storeName,
  defaultLocale,
  search = "",
}: {
  hero: StorefrontHero;
  storeName: string;
  defaultLocale: string;
  search?: string;
}) {
  const [images, collections, productChoices] = await Promise.all([
    db
      .select({ key: productImages.s3Key, title: products.title })
      .from(productImages)
      .innerJoin(products, eq(products.id, productImages.productId))
      .where(
        and(
          eq(products.isPublished, true),
          search ? ilike(products.title, `%${search}%`) : undefined,
        ),
      )
      .limit(40),
    db
      .select({
        id: productCollections.id,
        key: productCollections.imageKey,
        title: productCollections.title,
      })
      .from(productCollections)
      .where(
        and(
          eq(productCollections.isPublished, true),
          search
            ? or(
                ilike(productCollections.title, `%${search}%`),
                hero?.featuredCollectionIds?.length
                  ? inArray(productCollections.id, hero.featuredCollectionIds)
                  : undefined,
              )
            : undefined,
        ),
      )
      .orderBy(
        sql`case when ${hero?.featuredCollectionIds?.length ? inArray(productCollections.id, hero.featuredCollectionIds) : sql`false`} then 0 else 1 end`,
        productCollections.title,
      )
      .limit(40),
    db
      .select({ id: products.id, title: products.title })
      .from(products)
      .where(
        and(
          eq(products.isPublished, true),
          search
            ? or(
                ilike(products.title, `%${search}%`),
                hero?.featuredProductIds?.length
                  ? inArray(products.id, hero.featuredProductIds)
                  : undefined,
              )
            : undefined,
        ),
      )
      .orderBy(
        sql`case when ${hero?.featuredProductIds?.length ? inArray(products.id, hero.featuredProductIds) : sql`false`} then 0 else 1 end`,
        products.title,
      )
      .limit(40),
  ]);
  const options = [
    ...new Map(
      [...images, ...collections].filter((i) => i.key).map((i) => [i.key, i]),
    ).values(),
  ];
  if (hero?.imageKey && !options.some((image) => image.key === hero.imageKey))
    options.unshift({ key: hero.imageKey, title: "Current hero photograph" });
  return (
    <section className="panel" id="storefront">
      <h2>Storefront homepage</h2>
      <p className="muted">
        Choose photography uploaded to a published product or collection. Upload
        new photography in the catalog first. Results show up to 40 product
        images and 40 collections.
      </p>
      <form action="/admin/setup#storefront" className="flex gap-2">
        <Input
          aria-label="Find hero photography"
          name="heroSearch"
          defaultValue={search}
          maxLength={120}
          placeholder="Search products and collections"
        />
        <Button type="submit" variant="outline">
          Find images
        </Button>
      </form>
      <StorefrontSettingsForm
        hero={hero}
        storeName={storeName}
        defaultLocale={defaultLocale}
        images={options.filter(
          (image): image is { key: string; title: string } => !!image.key,
        )}
        products={productChoices}
      />
    </section>
  );
}
