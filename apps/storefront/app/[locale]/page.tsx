import Link from "next/link";
import Image from "next/image";
import { readApi, money, type Store } from "../../lib/api";
import { alternateLinks, publicOrigin } from "../../lib/seo";
import { getStorefrontMessages } from "../../lib/i18n";
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ search?: string; category?: string; page?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const store = await readApi<Store>("store");
  return {
    title: store.storeName,
    alternates: {
      canonical: `${publicOrigin()}/${locale}`,
      languages: alternateLinks(""),
    },
    openGraph: {
      title: store.storeName,
      url: `${publicOrigin()}/${locale}`,
      type: "website",
    },
    ...(query.search || query.category || query.page
      ? { robots: { index: false, follow: true } }
      : {}),
  };
}
export default async function Catalog({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ search?: string; category?: string; page?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const m = getStorefrontMessages(locale);
  const [store, catalog] = await Promise.all([
    readApi<Store>("store"),
    readApi<{
      items: {
        id: string;
        handle: string;
        title: string;
        description: string;
        coverImageKey: string | null;
        lowestPriceCents: number | null;
      }[];
      total: number;
      page: number;
      pageSize: number;
    }>(
      `catalog?${new URLSearchParams({ locale, search: query.search || "", category: query.category || "", page: query.page || "1" })}`,
    ),
  ]);
  return (
    <>
      <h1>{store.storeName}</h1>
      <form>
        <label>
          {m.catalog.searchProducts}
          <input name="search" defaultValue={query.search} />
        </label>
        <select
          name="category"
          aria-label={m.catalog.category}
          defaultValue={query.category || ""}
        >
          <option value="">{m.catalog.allCategories}</option>
          {store.categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <button>{m.catalog.search}</button>
      </form>
      <p>
        {catalog.total} {m.catalog.products}
      </p>
      <div className="grid">
        {catalog.items.map((p) => (
          <article className="card" key={p.id}>
            {p.coverImageKey && (
              <Image
                src={`/api/assets?key=${encodeURIComponent(p.coverImageKey)}`}
                alt=""
                width={400}
                height={300}
                unoptimized
                style={{ width: "100%", height: "auto" }}
              />
            )}
            <h2>
              <Link href={`/${locale}/products/${p.handle}`}>{p.title}</Link>
            </h2>
            <p className="muted">{p.description.slice(0, 150)}</p>
            {p.lowestPriceCents !== null && (
              <p>
                {money(p.lowestPriceCents, store.currency, store.precision)}
              </p>
            )}
          </article>
        ))}
      </div>
      <nav>
        {catalog.page > 1 && (
          <Link
            href={`?${new URLSearchParams({ ...query, page: String(catalog.page - 1) })}`}
          >
            {m.catalog.previous}
          </Link>
        )}
        {catalog.page * catalog.pageSize < catalog.total && (
          <Link
            href={`?${new URLSearchParams({ ...query, page: String(catalog.page + 1) })}`}
          >
            {m.catalog.next}
          </Link>
        )}
      </nav>
    </>
  );
}
