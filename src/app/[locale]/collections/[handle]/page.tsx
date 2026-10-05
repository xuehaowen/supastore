import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  productCollections,
  collectionTranslations,
  storeSettings,
} from "@/infrastructure/db/schema";
import { listProducts } from "@/application/use-cases/catalog/list-products";
import { money } from "@/infrastructure/web";
export default async function Collection({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; handle: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, handle } = await params;
  const [collection] = await db
    .select()
    .from(productCollections)
    .where(
      and(
        eq(productCollections.handle, handle),
        eq(productCollections.isPublished, true),
      ),
    )
    .limit(1);
  if (!collection) notFound();
  const translations = await db
    .select()
    .from(collectionTranslations)
    .where(eq(collectionTranslations.collectionId, collection.id));
  const [store] = await db.select().from(storeSettings).limit(1);
  const translated =
    translations.find((item) => item.locale === locale) ??
    translations.find((item) => item.locale === store?.defaultLocale);
  const query = await searchParams;
  const result = await listProducts({
    locale,
    collectionHandle: handle,
    page: Number(query.page) || 1,
  });
  return (
    <>
      <Link href={`/${locale}`}>
        ← {locale === "zh" ? "所有商品" : "All products"}
      </Link>
      <h1>{translated?.title ?? collection.title}</h1>
      <p>{translated?.description ?? collection.description}</p>
      {collection.imageKey && (
        <Image
          src={`/api/assets?key=${encodeURIComponent(collection.imageKey)}&inline=1`}
          alt={collection.imageAlt ?? collection.title}
          width={1200}
          height={600}
          sizes="(max-width: 767px) 88vw, 1200px"
          className="mb-8 max-h-96 w-full object-cover"
        />
      )}
      <section
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        aria-label={locale === "zh" ? "商品" : "Products"}
      >
        {result.items.map((product) => (
          <article key={product.id}>
            <Link href={`/${locale}/products/${product.handle}`}>
              {product.coverImageKey && (
                <Image
                  src={`/api/assets?key=${encodeURIComponent(product.coverImageKey)}&inline=1`}
                  alt={product.title}
                  width={400}
                  height={400}
                  sizes="(max-width: 639px) 88vw, (max-width: 1023px) 44vw, 30vw"
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              )}
              <h2>{product.title}</h2>
            </Link>
            <p>
              {product.lowestPriceCents === null
                ? "—"
                : money(
                    product.lowestPriceCents,
                    store?.currency,
                    store?.precision,
                  )}
            </p>
          </article>
        ))}
        {!result.items.length && (
          <p>
            {locale === "zh"
              ? "暂无商品。"
              : "No products in this collection yet."}
          </p>
        )}
      </section>
      <nav className="my-6 flex justify-between" aria-label="Collection pages">
        {result.page > 1 ? (
          <Link href={`?page=${result.page - 1}`}>←</Link>
        ) : (
          <span />
        )}
        {result.page * result.pageSize < result.total && (
          <Link href={`?page=${result.page + 1}`}>→</Link>
        )}
      </nav>
    </>
  );
}
