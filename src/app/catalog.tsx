import { localizeCategories } from "@/application/use-cases/catalog/localize";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { listProducts } from "@/application/use-cases/catalog/list-products";
import { db } from "@/infrastructure/db";
import { storeSettings, categories } from "@/infrastructure/db/schema";
import { getTranslations } from "next-intl/server";
import { money } from "@/infrastructure/web";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const t = await getTranslations({ locale });
  const result = await catalog({
    locale,
    search: query.q ?? "",
    categorySlug: query.category ?? "",
    page: Number(query.page) || 1,
  });
  const [store] = await db.select().from(storeSettings).limit(1);
  const groups = await localizeCategories(
    await db
      .select()
      .from(categories)
      .orderBy(categories.sortOrder, categories.slug),
    locale,
    store?.defaultLocale ?? "en",
  );
  return (
    <>
      <section className="relative min-h-[480px] border-b py-18 pr-[48%] max-sm:min-h-[580px] max-sm:py-10 max-sm:pr-0">
        <p className="mb-7 text-[10px] font-bold tracking-[0.2em]">THE EVERYDAY COLLECTION / 01</p>
        <h1 className="mb-7 font-serif text-5xl leading-none tracking-[-0.045em] md:text-7xl">{t("intro")}</h1>
        <p className="max-w-sm leading-7 text-muted-foreground">{t("subtitle")}</p>
        <a className="mt-6 inline-block border-b pb-1.5 text-sm no-underline" href="#collection">
          {t("collection")} ↓
        </a>
        <div className="absolute top-0 right-0 -z-10 h-[90%] w-[43%] overflow-hidden rounded-t-full bg-[#e6e7d5] max-sm:top-auto max-sm:bottom-5 max-sm:h-60 max-sm:w-[65%]" aria-hidden="true">
          <div className="absolute bottom-[15%] left-[20%] h-[50%] w-[37%] rounded-[30%_30%_42%_42%] bg-[#bc8962] shadow-xl" />
          <div className="absolute right-[7%] bottom-[22%] aspect-square w-[34%] rounded-full bg-[radial-gradient(circle_at_35%_30%,#f3eed2,#b3b89b)] shadow-xl" />
          <span className="absolute right-6 bottom-5 text-[9px] tracking-[0.22em]">LESS, BUT BETTER.</span>
        </div>
      </section>
      <section id="collection">
        <div className="flex items-center justify-between gap-6 max-sm:flex-col max-sm:items-start">
          <h2>{t("collection")}</h2>
          <form className="flex gap-2 max-sm:w-full" action={"/" + locale + "/search"}>
            <label className="sr-only" htmlFor="search">
              {t("search")}
            </label>
            <Input
              id="search"
              name="q"
              placeholder={t("search")}
              defaultValue={query.q}
            />
            <Button type="submit">{t("searchButton")}</Button>
          </form>
        </div>
        <nav className="my-7 flex flex-wrap gap-2" aria-label="Categories">
          <Link
            className={"rounded-full border px-3 py-1.5 no-underline transition-colors " + (!query.category ? "border-primary bg-primary text-primary-foreground" : "border-transparent hover:border-border hover:bg-muted")}
            href={"/" + locale}
            aria-current={query.category ? undefined : "page"}
          >
            {t("all")}
          </Link>
          {groups.map((g) => (
            <Link
              className={"rounded-full border px-3 py-1.5 no-underline transition-colors " + (query.category === g.slug ? "border-primary bg-primary text-primary-foreground" : "border-transparent hover:border-border hover:bg-muted")}
              key={g.id}
              href={"/" + locale + "/search?category=" + g.slug}
              aria-current={query.category === g.slug ? "page" : undefined}
            >
              {g.parentId ? <span aria-hidden="true">↳ </span> : null}
              {g.name}
            </Link>
          ))}
        </nav>
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 md:grid-cols-3">
          {result.items.map((p, i) => (
            <article className="group" key={p.id}>
              <Link className="block no-underline" href={"/" + locale + "/products/" + p.handle}>
                <div className={"flex aspect-square items-center justify-center overflow-hidden " + (i % 3 === 1 ? "bg-[#eee2d6]" : "bg-[#e5e8df]")}>
                  {p.coverImageKey ? (
                    <img className="size-full object-cover transition-transform duration-300 motion-reduce:transition-none group-hover:scale-[1.02]"
                      src={
                        "/api/assets?key=" + encodeURIComponent(p.coverImageKey)
                      }
                      alt={p.title}
                      width="600"
                      height="600"
                      sizes="(max-width: 767px) 44vw, (max-width: 1024px) 30vw, 27vw"
                    />
                  ) : (
                    <span className="font-serif text-8xl text-[#889475]" aria-hidden="true">{p.title.slice(0, 1)}</span>
                  )}
                </div>
                <div className="mt-4 flex justify-between gap-3 text-sm max-sm:block">
                  <h3 className="text-base font-medium">{p.title}</h3>
                  <span className="shrink-0 text-muted-foreground group-hover:text-foreground">
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
        {!result.items.length && <Alert><AlertDescription>No products found.</AlertDescription></Alert>}
        <div className="flex justify-between py-7">
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
