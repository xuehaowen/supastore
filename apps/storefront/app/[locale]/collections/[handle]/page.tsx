import { readPage } from "../../../../lib/page-data";
import { textFor } from "@supastore/i18n/messages";
import Link from "next/link";
import Image from "next/image";
import { ProductCard } from "../../../product-card";
export default async function Collection({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; handle: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, handle } = await params;
  const { collection, translated, result, store } = await readPage(
    "collection",
    locale,
    { ...(await searchParams), handle },
  );
  return (
    <section className="storefront-collection">
      <Link href={`/${locale}`}>← {textFor(locale).all}</Link>
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
        className="storefront-product-grid"
        aria-label={textFor(locale).ui.products}
      >
        {result.items.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            locale={locale}
            currency={store?.currency}
            precision={store?.precision}
          />
        ))}
        {!result.items.length && (
          <div className="storefront-empty">
            <p>{textFor(locale).ui.noProductsInThisCollectionYet}</p>
            <Link href={"/" + locale}>{textFor(locale).all}</Link>
          </div>
        )}
      </section>
      <nav
        className="storefront-pagination"
        aria-label={textFor(locale).common.collectionPages}
      >
        {result.page > 1 ? (
          <Link href={`?page=${result.page - 1}`}>
            ← {textFor(locale).common.previous}
          </Link>
        ) : (
          <span />
        )}
        {result.page * result.pageSize < result.total && (
          <Link href={`?page=${result.page + 1}`}>
            {textFor(locale).common.next} →
          </Link>
        )}
      </nav>
    </section>
  );
}
