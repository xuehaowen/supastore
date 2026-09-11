import Link from "next/link";
import { unstable_cache } from "next/cache";
import { listProducts } from "@/application/use-cases/catalog/list-products";
import { db } from "@/infrastructure/db";
import { storeSettings, categories } from "@/infrastructure/db/schema";
import { getTranslations } from "next-intl/server";
import { money } from "@/infrastructure/web";
const catalog = unstable_cache(listProducts, ["public-catalog"], {
  tags: ["catalog"],
  revalidate: 3600,
});
export default async function Catalog({
  locale,
  query = {},
}: {
  locale: string;
  query?: { q?: string; category?: string; page?: string };
}) {
  const t = await getTranslations({locale});
  const result = await catalog({
    locale,
    search: query.q ?? "",
    categorySlug: query.category ?? "",
    page: Number(query.page) || 1,
  });
  const [store] = await db.select().from(storeSettings).limit(1);
  const groups = await db.select().from(categories);
  return (
    <>
      <section className="hero">
        <p className="eyebrow">THE EVERYDAY COLLECTION / 01</p>
        <h1>{t("intro")}</h1>
        <p>{t("subtitle")}</p>
        <a className="text-link" href="#collection">
          {t("collection")} ↓
        </a>
        <div className="hero-art" aria-hidden="true">
          <div className="vase" />
          <div className="orb" />
          <span>LESS, BUT BETTER.</span>
        </div>
      </section>
      <section id="collection">
        <div className="section-heading">
          <h2>{t("collection")}</h2>
          <form className="search" action={"/" + locale + "/search"}>
            <label className="sr-only" htmlFor="search">
              {t("search")}
            </label>
            <input
              id="search"
              name="q"
              placeholder={t("search")}
              defaultValue={query.q}
            />
            <button>{t("searchButton")}</button>
          </form>
        </div>
        <nav className="filters" aria-label="Categories">
          <Link href={"/" + locale}>{t("all")}</Link>
          {groups.map((g) => (
            <Link key={g.id} href={"/" + locale + "/search?category=" + g.slug}>
              {g.parentId ? "↳ " : ""}
              {g.name}
            </Link>
          ))}
        </nav>
        <div className="product-grid">
          {result.items.map((p, i) => (
            <article key={p.id}>
              <Link href={"/" + locale + "/products/" + p.handle}>
                <div className={"product-image tone-" + (i % 3)}>
                  {p.coverImageKey ? (
                    <img
                      src={
                        "/api/assets?key=" + encodeURIComponent(p.coverImageKey)
                      }
                      alt={p.title}
                      width="600"
                      height="600"
                    />
                  ) : (
                    <span aria-hidden="true">{p.title.slice(0, 1)}</span>
                  )}
                </div>
                <div className="product-meta">
                  <h3>{p.title}</h3>
                  <span>
                    {money(
                      p.lowestPriceCents ?? 0,
                      store?.currency,
                      store?.precision,
                    )}
                  </span>
                </div>
              </Link>
            </article>
          ))}
        </div>
        {!result.items.length && <p className="notice">No products found.</p>}
        <div className="pagination">
          {result.page > 1 && (
            <Link
              href={
                "?page=" +
                (result.page - 1) +
                "&q=" +
                encodeURIComponent(query.q ?? "")
              }
            >
              ← Previous
            </Link>
          )}
          {result.page * result.pageSize < result.total && (
            <Link
              href={
                "?page=" +
                (result.page + 1) +
                "&q=" +
                encodeURIComponent(query.q ?? "")
              }
            >
              Next →
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
