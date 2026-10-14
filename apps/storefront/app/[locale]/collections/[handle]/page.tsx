import { readPage } from "../../../../lib/page-data";
import { textFor } from "@supastore/i18n/messages";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { money } from "../../../../lib/web";
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
    <>
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
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        aria-label={textFor(locale).ui.products}
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
                    locale,
                  )}
            </p>
          </article>
        ))}
        {!result.items.length && (
          <p>{textFor(locale).ui.noProductsInThisCollectionYet}</p>
        )}
      </section>
      <nav
        className="my-6 flex justify-between"
        aria-label={textFor(locale).common.collectionPages}
      >
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
