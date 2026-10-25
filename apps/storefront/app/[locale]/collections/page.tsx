import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { readRequestPage } from "../../../lib/page-data";
import { publicPageMetadata } from "../../../lib/page-metadata";
import { textFor } from "@supastore/i18n/messages";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const data = await readRequestPage("collections", locale, await searchParams);
  return publicPageMetadata({
    locale,
    path: "/collections",
    title: textFor(locale).ui.collections,
    storeName: data.store?.storeName,
    page: data.page,
  });
}

export default async function Collections({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const { collections, collectionTitles, page, pageSize, total } =
    await readRequestPage("collections", locale, query);
  if (query.page && Number(query.page) !== page)
    redirect(`/${locale}/collections?page=${page}`);
  const t = textFor(locale);
  return (
    <section className="collection-directory">
      <Link href={`/${locale}`}>← {t.shop}</Link>
      <h1>{t.ui.collections}</h1>
      <div className="collection-directory-grid">
        {collections.map((collection) => {
          const translated = collectionTitles.find(
            (item) => item.collectionId === collection.id,
          );
          return (
            <article key={collection.id}>
              <Link href={`/${locale}/collections/${collection.handle}`}>
                {collection.imageKey && (
                  <Image
                    src={`/api/assets?key=${encodeURIComponent(collection.imageKey)}&inline=1`}
                    alt={
                      collection.imageAlt ||
                      translated?.title ||
                      collection.title
                    }
                    width={600}
                    height={400}
                    sizes="(max-width: 767px) 90vw, 30vw"
                  />
                )}
                <h2>{translated?.title || collection.title}</h2>
              </Link>
              {(translated?.description || collection.description) && (
                <p>{translated?.description || collection.description}</p>
              )}
            </article>
          );
        })}
      </div>
      {total === 0 && <p>{t.ui.noCollections}</p>}
      <nav className="storefront-pagination" aria-label={t.ui.collectionPages}>
        {page > 1 && <a href={`?page=${page - 1}`}>← {t.common.previous}</a>}
        <p>
          {t.ui.pagePosition
            .replace("{page}", String(page))
            .replace(
              "{pages}",
              String(Math.max(1, Math.ceil(total / pageSize))),
            )}
        </p>
        {page * pageSize < total && (
          <a href={`?page=${page + 1}`}>{t.common.next} →</a>
        )}
      </nav>
    </section>
  );
}
